import {createClient} from "redis";
import env from "../../config/env.js";

const redis = createClient({
  socket: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        return new Error("Redis: max reconnect attempts reached");
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

redis.on("error", (err) => {
  console.error("Redis client error:", err);
});

redis.on("reconnecting", () => {
  console.log("Redis reconnecting...");
});

export default redis;
