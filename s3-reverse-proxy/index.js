const fs = require('fs')
const path = require('path')
const express = require('express')
const httpProxy = require('http-proxy')

for (const file of [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]) {
    if (fs.existsSync(file)) process.loadEnvFile(file)
}

function required(name) {
    const value = process.env[name]
    if (!value) throw new Error(`Missing required environment variable: ${name}`)
    return value
}

const app = express()
const PORT = Number(process.env.PROXY_PORT) || 8000

const BASE_PATH = process.env.S3_BASE_URL
    || `https://${required('BUCKET_NAME')}.s3.${required('AWS_REGION')}.amazonaws.com/__outputs`

const proxy = httpProxy.createProxy()

app.use((req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];

    const id = '12dfefb7-55dd-4fbf-9c4a-9fd5c0412328'

    const resolvesTo = `${BASE_PATH}/${id}`

    return proxy.web(req, res, { target: resolvesTo, changeOrigin: true })

})

proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/')
        proxyReq.path += 'index.html'

})

app.listen(PORT, () => console.log(`Reverse Proxy Running..${PORT}`))
