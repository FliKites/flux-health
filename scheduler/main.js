const axios = require("axios");
const mongoose = require("mongoose");
const schedule = require("node-schedule");

// Define the MongoDB schema for our records
const recordSchema = new mongoose.Schema({
  name: String,
  ports: [Number],
  height: Number,
  dns_monitor_id: Number,
  http_monitor_id: Number,
});

const api = axios.create({
  baseURL: `http://kuma-api:${process.env.API_PORT}`,
});

const { MONGO_HOST, MONGO_INITDB_ROOT_USERNAME, MONGO_INITDB_ROOT_PASSWORD } =
  process.env;
// mongodb://root:example@mongo:27017/
const mongoUrl = `mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@${MONGO_HOST}/`;

// Define the MongoDB model for our records
const Monitor = mongoose.model("Monitor", recordSchema);

async function checkRecords() {
  console.log("checking records");
  try {
    // Make a GET request to the first endpoint
    const response1 = await axios.get(
      "https://explorer.runonflux.io/api/status"
    );
    const blocks = response1.data.info.blocks;
    // Make a GET request to the second endpoint
    const response2 = await axios.get(
      "https://api.runonflux.io/apps/globalappsspecifications"
    );
    const data = response2.data.data;
    // Loop over the data and check if each record is expired
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      const expire = record?.expire;
      const height = record?.height;
      const ports = record.compose?.map((item) => item.ports)?.flat();
      if (!expire) continue;

      if (expire + height > blocks && ports?.length) {
        // Check if the record exists in MongoDB
        const existingRecord = await Monitor.findOne({ name: record.name });
        console.log("existingRecord: ", existingRecord);
        if (!existingRecord) {
          // Create a new Monitor in MongoDB and call another API with the name as the request body
          let monitorAdded = null;
          try {
            monitorAdded = await api.post("/add_monitor", {
              name: record.name,
            });
          } catch (error) {
            console.log("unable to add monitor ", record.name);
            continue;
          }
          const newRecord = new Monitor({
            name: record.name,
            ports: ports,
            height: height,
            dns_monitor_id: monitorAdded.data.dns_monitor_id,
            http_monitor_id: monitorAdded.data.http_monitor_id,
          });
          await newRecord.save();
          console.log("record added");
        } else if (height > existingRecord.height) {
          // Update the height of the existing record in MongoDB
          existingRecord.height = height;
          await existingRecord.save();
          console.log("record updated");
        }
      } else {
        // If the record is not expired, check if it exists in MongoDB and delete it if it does
        const existingRecord = await Monitor.findOne({ name: record.name });
        if (existingRecord) {
          try {
            await api.post("/pause_monitor", {
              dns_monitor_id: record.dns_monitor_id,
              http_monitor_id: record.http_monitor_id,
            });
            console.log(
              "monitor paused and record removing ",
              existingRecord.name
            );
            await existingRecord.remove();
          } catch (error) {
            console.log("unable to pause or remove record ", error?.message);
          }
        }
      }
    }
  } catch (error) {
    console.log(error?.message);
    console.log("unable to complete the tasks");
  }
}

// Connect to MongoDB
mongoose
  .connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("Connected to MongoDB");
    await checkRecords();
    // Schedule the checkRecords function to run every 10 minutes
    const job = schedule.scheduleJob("*/10 * * * *", checkRecords);
  })
  .catch((error) => {
    console.error(error?.message);
    console.log("connection failed.");
  });
