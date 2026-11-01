const { exec } = require("child_process")
const path = require("path")
const fs = require("fs")
const mime = require('mime-types')
const Redis = require('ioredis')
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")



function publishLog(log){
    publisher.publish(`log:${PROJECT_ID}`, JSON.stringify({log}))
}

const s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    } : undefined
})

const PROJECT_ID = process.env.PROJECT_ID
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID

const kafka = new Kafka({
    clientId : `docker-build-server-${DEPLOYMENT_ID}`,
    brokers : ["kafka-196ac367-deployment.c.aivencloud.com:27898"],
    ssl:{
        ca: [fs.readFileSync(path.join(__dirname,"kafka.pem"),'utf8')]
    },
})


const producer = kafka.producer()

async function publishLog(log){
    await producer.send({topic:`container:log:${PROJECT_ID}`,messages:[{key:'log',value:JSON.stringify({PROJECT_ID,DEPLOYMENT_ID,log})}]})
}




async function init(){

    await producer.connect()

    console.log("Executing script.js")
    await publishLog("BUILD Started.....")

    const outDirPath = path.join(__dirname, "output")

    const p = exec(`cd ${outDirPath} && npm install --legacy-peer-deps && npm run build`)

    p.stdout.on('data', async function(data){
        console.log(data.toString())
        await publishLog(`BUILD LOG : ${data.toString()}`)
    })

    p.stderr.on('data',async function(data){
        console.error(data.toString())
        await publishLog(`BUILD LOG : ${data.toString()}`)
    })

    p.on('error', async function(err){
        console.error("Process error:", err)
        await publishLog(`BUILD FAILED : ${err}`)
    })

    p.on('close', async function(code){
        if (code !== 0) {
            console.error(`Build failed with exit code ${code}`)
            await publishLog(`BUILD FAILED : ${code}`)
            process.exit(code)
        }

        console.log("build complete")
        await publishLog("BUILD COMPLETED.....")

        const candidateDirs = ['dist', 'build', 'out', '.next']
        let distFolderPath = null

        for (const dir of candidateDirs) {
            const candidatePath = path.join(__dirname, "output", dir)
            if (fs.existsSync(candidatePath)) {
                distFolderPath = candidatePath
                break
            }
        }

        if (!distFolderPath) {
            console.error(`Build output directory not found in: ${candidateDirs.join(', ')}`)
            process.exit(1)
        }

        console.log(`Using build output directory: ${distFolderPath}`)

        const distFolderContent = fs.readdirSync(distFolderPath, { recursive: true })

        for (const file of distFolderContent){
            const filePath = path.join(distFolderPath, file)
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log("UPLOADING....", filePath)
            await publishLog(`UPLOADING..... ${filePath}`)

            const command = new PutObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: `__output/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath) || 'application/octet-stream'
            })

            await s3Client.send(command)
            console.log("UPLOADED....", filePath)
            await publishLog(`UPLOADED..... ${filePath}`)

            // If .next build, also ensure root index.html and _next/ assets are mapped
            if (distFolderPath.endsWith('.next')) {
                if (file.startsWith('static/')) {
                    await s3Client.send(new PutObjectCommand({
                        Bucket: process.env.BUCKET_NAME,
                        Key: `__output/${PROJECT_ID}/_next/${file}`,
                        Body: fs.createReadStream(filePath),
                        ContentType: mime.lookup(filePath) || 'application/octet-stream'
                    }))
                }
                if (file === 'server/app/index.html' || file === 'server/pages/index.html') {
                    await s3Client.send(new PutObjectCommand({
                        Bucket: process.env.BUCKET_NAME,
                        Key: `__output/${PROJECT_ID}/index.html`,
                        Body: fs.createReadStream(filePath),
                        ContentType: 'text/html'
                    }))
                }
            }
        }

        console.log("deployment complete")
        await publishLog("DEPLOYMENT COMPLETED.....")
    })
}

init()
