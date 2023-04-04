import os
from fastapi import FastAPI, Request, Depends, HTTPException
from uptime_kuma_api import UptimeKumaApi, MonitorType
from pydantic import BaseModel

app = FastAPI()


class UptimeKumaMiddleware:
    def __init__(self, username, password):
        self.username = username
        self.password = password
        self.api = None
        print("username ", username)
        print("password ", password)

    async def __call__(self, request: Request, call_next):
        if not self.api:
            self.api = UptimeKumaApi(os.getenv('UPTIME_KUMA_SERVER'))
            self.api.login(self.username, self.password)
        response = await call_next(request)
        self.api.disconnect()
        return response


class AddMonitorModel(BaseModel):
    name: str


class PauseMonitorModel(BaseModel):
    http_monitor_id: int
    dns_monitor_id: int


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
        api.disconnect()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/add_monitor")
async def add_monitor(data: AddMonitorModel):
    """Add a monitor to Uptime Kuma."""
    api = None
    try:
        username = os.getenv('UPTIME_KUMA_USERNAME')
        password = os.getenv('UPTIME_KUMA_PASSWORD')
        api = UptimeKumaApi(os.getenv('UPTIME_KUMA_SERVER'))
        api.login(username, password)
        print(data)
        name = data.name
        print('name ', name)
        http = api.add_monitor(
            type=MonitorType.HTTP, name=f"{name} - HTTP", url=f"https://{name}.app.runonflux.io", hostname=f"{name}.app.runonflux.io")
        dns = api.add_monitor(
            type=MonitorType.DNS, name=f"{name} - DNS", url=f"https://{name}.app.runonflux.io", hostname=f"{name}.app.runonflux.io")
        api.disconnect()
        return {"message": f"successfully added monitor for {name}", "http_monitor_id": http['monitorID'], "dns_monitor_id": dns['monitorID']}
    except Exception as e:
        print(e)
        api.disconnect()
        raise HTTPException(status_code=500, detail=str(e))


# @app.middleware("http")
# async def add_api_client(request: Request, call_next):
#     try:
#         username = os.getenv('UPTIME_KUMA_USERNAME')
#         password = os.getenv('UPTIME_KUMA_PASSWORD')
#         print("username2 ", username)
#         print("password2 ", password)
#         request.state.api = UptimeKumaApi(os.getenv('UPTIME_KUMA_SERVER'))
#         request.state.api.login(username, password)
#         response = await call_next(request)
#         request.state.api.disconnect()
#         return response
#     except Exception as e:
#         print(e)
#         response = await call_next(request)
#         return response
