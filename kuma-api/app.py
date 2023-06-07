import os
from typing import List, Optional

from pydantic import BaseModel

from fastapi import FastAPI, Request, HTTPException

from uptime_kuma_api import UptimeKumaApi, MonitorType

app = FastAPI()


class AddMonitorModel(BaseModel):
    name: str
    ips: Optional[List[str]] = []
    ports: Optional[List[int]] = []
    domains: Optional[List[str]] = []


class PauseMonitorModel(BaseModel):
    http_monitor_id: int
    dns_monitor_id: int


class DeleteMonitorModel(BaseModel):
    ips: Optional[List[str]] = []
    ports: Optional[List[int]] = []
    monitor_ids: Optional[List[int]] = []
    domains: Optional[List[str]] = []


@app.post("/pause_monitor")
async def pause_monitor(data: PauseMonitorModel):
    """Pause a monitor in Uptime Kuma."""
    api = None
    try:
        username = os.getenv('UPTIME_KUMA_USERNAME')
        password = os.getenv('UPTIME_KUMA_PASSWORD')
        api = UptimeKumaApi(os.getenv('UPTIME_KUMA_SERVER'))
        api.login(username, password)

        if not data.http_monitor_id and not data.dns_monitor_id:
            return {"message": f"No monitor found with id HTTP: {data.http_monitor_id}, DNS: {data.dns_monitor_id}."}
        await api.pause_monitor(data.http_monitor_id)
        await api.pause_monitor(data.dns_monitor_id)
        api.disconnect()
        return {"message": f"HTTP:{data.http_monitor_id}, DNS:{data.dns_monitor_id} Monitor paused successfully."}
    except Exception as e:
        print(e)
        if api:
            api.disconnect()
        raise HTTPException(status_code=500, detail=str(e))


# @app.post("/add_monitor")
# async def add_monitor(data: AddMonitorModel):
#     """Add a monitor to Uptime Kuma."""
#     print("data ", data)
#     api = None
#     try:
#         username = os.getenv('UPTIME_KUMA_USERNAME')
#         password = os.getenv('UPTIME_KUMA_PASSWORD')
#         api = UptimeKumaApi(os.getenv('UPTIME_KUMA_SERVER'))
#         api.login(username, password)
#         name = data.name
#         print("name adding ", name)
#         existing_monitors = api.get_monitors()

#         http_monitor_id, dns_monitor_id = None, None
#         if not (name.startswith("PresearchNode") or name.startswith("BrokerNode")):
#             if f"{name} - HTTP" not in (monitor['name'] for monitor in existing_monitors):
#                 http_monitor_id = api.add_monitor(
#                     type=MonitorType.HTTP, name=f"{name} - HTTP", url=f"https://{name}.app.runonflux.io", hostname=f"{name}.app.runonflux.io")['monitorID']
#             if f"{name} - DNS" not in (monitor['name'] for monitor in existing_monitors):
#                 dns_monitor_id = api.add_monitor(
#                     type=MonitorType.DNS, name=f"{name} - DNS", url=f"https://{name}.app.runonflux.io", hostname=f"{name}.app.runonflux.io")['monitorID']

#         port_monitor_ids = []
#         if data.ips and data.ports:
#             for port in data.ports:
#                 for ip in data.ips:
#                     port_monitor = api.add_monitor(
#                         type=MonitorType.PORT, name=f"{name} - {ip}:{port}", hostname=ip, port=port)
#                     port_monitor_ids.append(port_monitor['monitorID'])

#         if data.domains:
#             for domain in data.domains:
#                 api.add_monitor(
#                     type=MonitorType.HTTP, name=f"{name} - HTTP ({domain})", url=f"https://{domain}", hostname=domain)
#                 api.add_monitor(
#                     type=MonitorType.DNS, name=f"{name} - DNS ({domain})", hostname=domain)

#         api.disconnect()
#         return {"message": f"successfully added monitor for {name}",
#                 "http_monitor_id": http_monitor_id,
#                 "dns_monitor_id": dns_monitor_id,
#                 "port_monitor_ids": port_monitor_ids}
#     except Exception as e:
#         print(e)
#         if api:
#             api.disconnect()
#         raise HTTPException(status_code=500, detail=str(e))

@app.post("/add_monitor")
async def add_monitor(data: AddMonitorModel):
    """Add a monitor to Uptime Kuma."""
    print("data ", data)
    api = None
    try:
        username = os.getenv('UPTIME_KUMA_USERNAME')
        password = os.getenv('UPTIME_KUMA_PASSWORD')
        api = UptimeKumaApi(os.getenv('UPTIME_KUMA_SERVER'))
        api.login(username, password)
        name = data.name
        print("name adding ", name)
        existing_monitors = api.get_monitors()
        # print("exisiting monitors ", existing_monitors)
        http_monitor_id, dns_monitor_id = None, None
        if not (name.startswith("PresearchNode") or name.startswith("BrokerNode")):
            for monitor in existing_monitors:
                if monitor['name'] == f"{name} - HTTP":
                    http_monitor_id = monitor['id']
                elif monitor['name'] == f"{name} - DNS":
                    dns_monitor_id = monitor['id']

            print("http_monitor ", http_monitor_id)
            print("dns_monitor_id ", dns_monitor_id)

            if http_monitor_id is None:
                api.add_monitor(
                    type=MonitorType.HTTP, name=f"{name} - HTTP", url=f"https://{name}.app.runonflux.io", hostname=f"{name}.app.runonflux.io")

            if dns_monitor_id is None:
                api.add_monitor(
                    type=MonitorType.DNS, name=f"{name} - DNS", url=f"https://{name}.app.runonflux.io", hostname=f"{name}.app.runonflux.io")
            if data.ips and data.ports:
                for port in data.ports:
                    try:
                        for ip in data.ips:
                            for monitor in existing_monitors:
                                if monitor['name'] == f"{name} - {ip}:{port}":
                                    break
                            else:
                                print("ip:port ", name)
                                api.add_monitor(
                                    type=MonitorType.PORT, name=f"{name} - {ip}:{port}", hostname=ip, port=port)
                    except Exception as e:
                        print("tcp ", e)
                    try:
                        for monitor in existing_monitors:
                            if monitor['name'] == f"{name}_{port} - DNS":
                                break
                        else:
                            print(f"{name}_{port}.app.runonflux.io")
                            api.add_monitor(
                                type=MonitorType.DNS, name=f"{name}_{port} - DNS", url=f"https://{name}_{port}.app.runonflux.io", hostname=f"{name}_{port}.app.runonflux.io")
                    except Exception as e:
                        print(e)

        if data.domains:
            for domain in data.domains:
                for monitor in existing_monitors:
                    if monitor['name'] == f"{name} - HTTP ({domain})":
                        break
                    if monitor['name'] == f"{name} - DNS ({domain})":
                        break
                else:
                    try:
                        print("adding domain monitor ", domain)
                        api.add_monitor(
                            type=MonitorType.HTTP, name=f"{name} - HTTP ({domain})", url=f"https://{domain}", hostname=domain)
                        api.add_monitor(
                            type=MonitorType.DNS, name=f"{name} - DNS ({domain})", hostname=domain)
                    except Exception as e:
                        print(e)

        api.disconnect()
        return {"message": f"successfully added monitor for {name}"}
    except Exception as e:
        print(e)
        print("error ", e)
        if api:
            api.disconnect()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/delete_monitors")
async def delete_monitors(data: DeleteMonitorModel):
    """Delete monitors in Uptime Kuma."""
    api = None
    try:
        username = os.getenv('UPTIME_KUMA_USERNAME')
        password = os.getenv('UPTIME_KUMA_PASSWORD')
        api = UptimeKumaApi(os.getenv('UPTIME_KUMA_SERVER'))
        api.login(username, password)
        monitors = api.get_monitors()
        deleted_monitors = []

        for monitor in monitors:
            if (data.monitor_ids and monitor['id'] in data.monitor_ids) or \
               (monitor['type'] == 'port' and ((data.ips or data.ports) and (monitor['hostname'] in data.ips or monitor['port'] in data.ports))) or \
               (monitor['type'] in ['http', 'dns'] and data.domains and any(domain in monitor['url'] for domain in data.domains)):
                api.delete_monitor(monitor['id'])
                deleted_monitors.append(monitor['id'])

            # if (data.monitor_ids and monitor['id'] in data.monitor_ids) or \
            #         (monitor['type'] == 'port' and ((data.ips or data.ports and (monitor['hostname'] in data.ips) or (monitor['port'] in data.ports)))):
            #     api.delete_monitor(monitor['id'])
            #     deleted_monitors.append(monitor['id'])

        api.disconnect()
        return {"message": f"Monitors deleted successfully.", "deleted_monitors": deleted_monitors}
    except Exception as e:
        print(e)
        if api:
            api.disconnect()
        raise HTTPException(status_code=500, detail=str(e))
