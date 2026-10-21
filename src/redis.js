const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379",
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
  }
});

redisClient.on("error", (error) => {
  console.error("Redis error:", error.message);
});

async function connectRedis() {
  try {
    await redisClient.connect();
    console.log("Ket noi Redis thanh cong!");
  } catch (error) {
    console.error("Khong the ket noi Redis:", error.message);
  }
}

async function clearTasksCache() {
  if (!redisClient.isReady) return;

  try {
    await redisClient.del("tasks:all");
    console.log("CACHE CLEARED");
  } catch (error) {
    console.error("Loi xoa cache:", error.message);
  }
}

module.exports = {
  redisClient,
  connectRedis,
  clearTasksCache
};
