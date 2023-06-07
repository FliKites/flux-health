const axios = require("axios");
const schedule = require("node-schedule");

const APP_NAME = process.env.APP_NAME?.split(",")?.map((n) => n.trim()) ?? [];

const api = axios.create({
  baseURL: `http://kuma-api:${process.env.API_PORT}`,
});

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
      if (APP_NAME.includes(record.name)) {
        console.log("ADDING/updating ", record.name);
        const ipList = await getIPList(record.name);
        // Create a new Monitor in MongoDB and call another API with the name as the request body
        let monitorAdded = null;
        try {
          const payload = {
            name: record.name,
            ips: ipList,
            ports: ports,
            domains,
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

        console.log("record added");
      }
    }
  } catch (e) {
    console.log("error ", e?.message);
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
      await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000)); // Wait for 60 minutes
    } catch (error) {
      console.error("Error in monitoring loop:", error?.message);
    }
  }
}

startMonitoringLoop();
