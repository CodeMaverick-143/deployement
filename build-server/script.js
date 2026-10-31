const { exec } = require("child_process")
const path = require("path")
const fs = require("fs")
const mime = require('mime-types')
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")


const s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    } : undefined
})

const PROJECT_ID = process.env.PROJECT_ID

async function init(){
    console.log("Executing script.js")

    const outDirPath = path.join(__dirname, "output")

    const p = exec(`cd ${outDirPath} && npm install --legacy-peer-deps && npm run build`)

    p.stdout.on('data', function(data){
        console.log(data.toString())
    })

    p.stderr.on('data', function(data){
        console.error(data.toString())
    })

    p.on('error', function(err){
        console.error("Process error:", err)
    })

    p.on('close', async function(code){
        if (code !== 0) {
            console.error(`Build failed with exit code ${code}`)
            process.exit(code)
        }

        console.log("build complete")

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

            const command = new PutObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: `__output/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath) || 'application/octet-stream'
            })

            await s3Client.send(command)
            console.log("UPLOADED....", filePath)

        }

        console.log("deployment complete")
    })
}

init()
