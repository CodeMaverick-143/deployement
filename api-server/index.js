const express = require('express')
const {generateSlug} = require(`random-word-slugs`)
const {ECSClient, RunTaskCommand, Cluster$} = require('@aws-sdk/client-ecs')
const {Server} = require('socket.io')
const Redis = require('ioredis')

const subscriber = new Redis(process.env.REDIS_URL)

const io = new Server({
    cors:{
        origin:"*"
    }
})

io.on("connection", (socket)=>{
    socket.on( 'subscribe', channel=>{
        socket.join(channel),
        socket.emit("message", `Joined ${channel}`)
    })
})

io.listen(9001, ()=>{
    console.log("Socket Server is running....")
})

const app = express();
const PORT = 9000;

app.use(express.json())

const ecsClient = new ECSClient({ 
    credentials:{
        accessKeyId:process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken:process.env.AWS_SESSION_TOKEN,
        region:process.env.AWS_REGION
    }
})

const config = {
    CLUSTER:process.env.CLUSTER,
    TASK:process.env.TASK
}

app.post('/project',async (req,res)=>{
    const {github} = req.body
    const projectSlug = generateSlug()

    const command = new RunTaskCommand({
        cluster : config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count:1,
        networkConfiguration: {
            awsvpcConfiguration: {
                subnets:['subnet-00e7da54b8c7f3ef9','subnet-04298afe887b4a949','subnet-087174d565f5caf3e'],
                securityGroups:['sg-0d83738c740320f7f'],
                assignPublicIp: true
            }
        },

        overrides:{
            containerOverrides:[
                {
                    name:'Main',
                    environment:[
                        {name:'GIT_REPOSITORY_URL',value:github},
                        {name:'PROJECT_SLUG',value:projectSlug},
                        {name:'AWS_REGION',value:'us-east-1'},
                        {name:'AWS_SECRET_ACCESS_KEY',value:process.env.AWS_SECRET_ACCESS_KEY},
                        {name:'AWS_ACCESS_KEY_ID',value:process.env.AWS_ACCESS_KEY_ID},
                        {name:'AWS_SESSION_TOKEN',value:process.env.AWS_SESSION_TOKEN},
                        {name:'AWS_DEFAULT_REGION',value:process.env.AWS_DEFAULT_REGION},
                    ]

                }
            ]
        }

    })

    await ecsClient.send(command);

    return res.json({status:'queued', data:{projectSlug, url: `http://${projectSlug}.localhost:8000`}})

    
})

function initRedisSubscribe(){
    console.log('Subscribed to logs......')
    subscriber.psubscribe(`log:${projectSlug}`)
    subscriber.on('pmessage', (pattern, channel, message)=>{
        io.to(channel).emit('message', message)
    })
}

initRedisSubscribe();

app.listen(PORT, ()=>{
    console.log("API-SERVICE is running....")
})

