import { createClient } from 'redis';

const redisClient = createClient({
    username: 'default',
    password: 'ssu5V75P2kljYHLglPHEY4FVXHi40w3F',
    socket: {
        host: 'redis-19393.crce182.ap-south-1-1.ec2.cloud.redislabs.com',
        port: 19393
    }
});

redisClient.on('error', err => console.log('Redis Client Error', err));

export const connectRedis = async () => {
    if (!redisClient.isOpen) {
        await redisClient.connect();
        console.log('Redis connected');
    }
};
