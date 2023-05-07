const axios = require("axios");
const mongoose = require("mongoose");
const schedule = require("node-schedule");

// Define the MongoDB schema for our records
const recordSchema = new mongoose.Schema({
  name: String,
  ports: [Number],
  ips: [String],
  height: Number,
  dns_monitor_id: Number,
  http_monitor_id: Number,
  domains: [String],
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
      const ports = record.compose
        ?.map((item) => item.ports)
        ?.flat()
        ?.map(Number);
      const domains = (
        record?.domains ??
        record.compose?.map((item) => item.domains)?.flat() ??
        []
      ).filter((domain) => domain.trim());

      if (!expire) continue;
      const ipList = await getIPList(record.name);

      if (expire + height > blocks && ports?.length) {
        // Check if the record exists in MongoDB
        const existingRecord = await Monitor.findOne({ name: record.name });
        console.log("existingRecord: ", existingRecord);
        if (!existingRecord) {
          // Create a new Monitor in MongoDB and call another API with the name as the request body
          let monitorAdded = null;
          try {
            const payload = {
              name: record.name,
              ips: ipList,
              ports: ports,
            };
            // console.log("sedning  ", payload);
            monitorAdded = await api.post("/add_monitor", payload);
            // console.log("monitorAdded ", monitorAdded);
          } catch (error) {
            console.log("error ", error?.message);
            console.log("unable to add monitor ", record.name);
            // break;
            continue;
          }
          const newRecord = new Monitor({
            name: record.name,
            ports: ports,
            height: height,
            ips: ipList,
            dns_monitor_id: monitorAdded.data.dns_monitor_id,
            http_monitor_id: monitorAdded.data.http_monitor_id,
            domains,
          });
          await newRecord.save();
          console.log("record added");
        }
        // else if (height > existingRecord.height) {
        //   // Update the height of the existing record in MongoDB
        //   existingRecord.height = height;
        //   await existingRecord.save();
        //   console.log("record updated");
        // }
        else {
          const updatedIps = ipList.filter(
            (ip) => !existingRecord.ips.includes(ip)
          );
          const updatedPorts = ports.filter(
            (port) => !existingRecord.ports.includes(port)
          );

          const updatedDomains = domains.filter(
            (domain) => !existingRecord.domains.includes(domain)
          );

          const deletedIps = existingRecord.ips.filter(
            (ip) => !ipList.includes(ip)
          );
          const deletedPorts = existingRecord.ports.filter(
            (port) => !ports.includes(port)
          );
          const deletedDomains = existingRecord.domains.filter(
            (domain) => !domains.includes(domain)
          );

          if (
            deletedIps.length > 0 ||
            deletedPorts.length > 0 ||
            deletedDomains.length > 0
          ) {
            try {
              await api.post("/delete_monitors", {
                ips: deletedIps,
                ports: deletedPorts,
                domains: deletedDomains,
              });
              console.log("monitor removed for changed ips ", deletedIps);
              console.log("monitor removed for changed ports ", deletedPorts);
              console.log(
                "monitor removed for changed domains ",
                deletedDomains
              );
            } catch (error) {
              console.log(
                "unable to delete monitors with non-matching IPs and ports: ",
                error.message
              );
            }
          }

          if (updatedIps.length) {
            try {
              await api.post("/add_monitor", {
                name: record.name,
                ips: updatedIps,
                ports: ports,
              });
            } catch (error) {
              console.log(
                `unable to add new monitors for latest ip `,
                error?.message
              );
            }
          }

          if (updatedPorts.length) {
            try {
              await api.post("/add_monitor", {
                name: record.name,
                ips: ipList,
                ports: updatedPorts,
              });
            } catch (error) {
              console.log(
                `unable to add new monitors for latest ip `,
                error?.message
              );
            }
          }

          if (updatedDomains.length) {
            try {
              await api.post("/add_monitor", {
                domains: updatedDomains,
              });
            } catch (error) {
              console.log(
                `unable to add new monitors for latest ip `,
                error?.message
              );
            }
          }

          if (
            height > existingRecord.height ||
            updatedIps.length > 0 ||
            updatedPorts.length > 0
          ) {
            // Update the height, IPs, and ports of the existing record in MongoDB
            existingRecord.height = height;
            existingRecord.ips = ipList;
            existingRecord.ports = ports;
            existingRecord.domains = domains;
            await existingRecord.save();
            console.log("record updated");
          }
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
            // Delete all port monitors related to the existing record
            // await api.post("/delete_monitors", {
            //   ips: existingRecord.ips,
            //   ports: existingRecord.ports,
            //   domains: existingRecord.domains,
            // });
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

async function getIPList(name) {
  const resp = await axios.get(
    `https://api.runonflux.io/apps/location/${name}`
  );
  const appIPs = resp.data.data;
  return appIPs.map((app) => app.ip.split(":")[0].trim()).filter((ip) => ip);
}

async function startMonitoringLoop() {
  while (true) {
    try {
      await checkRecords();
      console.log("Waiting for restart...");
      await new Promise((resolve) => setTimeout(resolve, 3 * 60 * 1000)); // Wait for 3 minutes
    } catch (error) {
      console.error("Error in monitoring loop:", error?.message);
    }
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
    startMonitoringLoop();
  })
  .catch((error) => {
    console.error(error?.message);
    console.log("connection failed.");
  });
