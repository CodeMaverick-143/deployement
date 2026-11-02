const fs = require('fs')
const path = require('path')

for (const file of [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]) {
    if (fs.existsSync(file)) process.loadEnvFile(file)
}

function required(name) {
    const value = process.env[name]
    if (!value) throw new Error(`Missing required environment variable: ${name}`)
    return value
}

const list = value => (value || '').split(',').map(s => s.trim()).filter(Boolean)

function kafkaCa() {
    if (process.env.KAFKA_CA_CERT) return process.env.KAFKA_CA_CERT.replace(/\\n/g, '\n')
    const caPath = path.resolve(__dirname, process.env.KAFKA_CA_PATH || 'kafka.pem')
    return fs.readFileSync(caPath, 'utf-8')
}

module.exports = {
    PORT: Number(process.env.PORT) || 9000,
    SOCKET_PORT: Number(process.env.SOCKET_PORT) || 9002,

    AWS_REGION: required('AWS_REGION'),

    ECS: {
        CLUSTER: required('CLUSTER'),
        TASK: required('TASK'),
        CONTAINER_NAME: process.env.ECS_CONTAINER_NAME || 'build-server-img',
        SUBNETS: list(required('ECS_SUBNETS')),
        SECURITY_GROUPS: list(required('ECS_SECURITY_GROUPS')),
    },

    KAFKA: {
        BROKERS: list(required('KAFKA_BROKERS')),
        USERNAME: required('KAFKA_USERNAME'),
        PASSWORD: required('KAFKA_PASSWORD'),
        TOPIC: process.env.KAFKA_LOGS_TOPIC || 'container-logs',
        ca: kafkaCa,
    },

    CLICKHOUSE: {
        HOST: required('CLICKHOUSE_HOST'),
        DATABASE: process.env.CLICKHOUSE_DATABASE || 'default',
        USERNAME: required('CLICKHOUSE_USERNAME'),
        PASSWORD: required('CLICKHOUSE_PASSWORD'),
    },
}
