const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const { Kafka } = require('kafkajs')

for (const file of [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]) {
    if (fs.existsSync(file)) process.loadEnvFile(file)
}

function required(name) {
    const value = process.env[name]
    if (!value) throw new Error(`Missing required environment variable: ${name}`)
    return value
}

function kafkaCa() {
    if (process.env.KAFKA_CA_CERT) return process.env.KAFKA_CA_CERT.replace(/\\n/g, '\n')
    return fs.readFileSync(path.resolve(__dirname, process.env.KAFKA_CA_PATH || 'kafka.pem'), 'utf-8')
}

const PROJECT_ID = required('PROJECT_ID')
const DEPLOYEMENT_ID = required('DEPLOYEMENT_ID')
const BUCKET_NAME = required('BUCKET_NAME')
const KAFKA_LOGS_TOPIC = process.env.KAFKA_LOGS_TOPIC || 'container-logs'

const s3Client = new S3Client({ region: required('AWS_REGION') })

const kafka = new Kafka({
    clientId: `docker-build-server-${DEPLOYEMENT_ID}`,
    brokers: required('KAFKA_BROKERS').split(',').map(s => s.trim()).filter(Boolean),
    ssl: { ca: [kafkaCa()] },
    sasl: {
        username: required('KAFKA_USERNAME'),
        password: required('KAFKA_PASSWORD'),
        mechanism: 'plain'
    }
})

const producer = kafka.producer()

async function publishLog(log) {
    await producer.send({ topic: KAFKA_LOGS_TOPIC, messages: [{ key: 'log', value: JSON.stringify({ PROJECT_ID, DEPLOYEMENT_ID, log }) }] })
}

async function init() {

    await producer.connect()

    console.log('Executing script.js')
    await publishLog('Build Started...')
    const outDirPath = path.join(__dirname, 'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', function (data) {
        console.log(data.toString())
        publishLog(data.toString())
    })

    p.stdout.on('error', async function (data) {
        console.log('Error', data.toString())
        await publishLog(`error: ${data.toString()}`)
    })

    p.on('close', async function () {
        console.log('Build Complete')
        await publishLog(`Build Complete`)
        const distFolderPath = path.join(__dirname, 'output', 'dist')
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true })

        await publishLog(`Starting to upload`)
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file)
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('uploading', filePath)
            await publishLog(`uploading ${file}`)

            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })

            await s3Client.send(command)
            publishLog(`uploaded ${file}`)
            console.log('uploaded', filePath)
        }
        await publishLog(`Done`)
        console.log('Done...')
        process.exit(0)
    })
}

init()
