#!/usr/bin/env python3

# Here we setup the environment for the tests.
# Inside ./Deliveroo.js/backend/ we have a node project which we will launch,
# for the time being without updatating the .env file. This will spawn a http
# server which will be our benchmark target.

from pathlib import Path

from testcontainers.core.container import DockerContainer
from testcontainers.core.image import DockerImage
from testcontainers.generic import ServerContainer

ADMIN_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6ImFkbWluIiwidGVhbUlkIjowLCJ0ZWFtTmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzU1NzA5MjM2fQ.14P--E6hePoqLFCqlbb_TA5kRWbNs7PtBde9E5aC-_Q"
SRV_DOCKERFILE_PATH = Path(__file__).parent / "Deliveroo"
APP_DOCKERFILE_PATH = Path(__file__).parent.parent


def main():
    with DockerImage(
        path=SRV_DOCKERFILE_PATH, clean_up=False, tag="deliveroo-srv:testcontainers"
    ) as srv_image:
        with ServerContainer(port=8080, image=srv_image).with_env(
            "LEVEL", "levels/24c1_4.js"
        ).with_env("PORT", "8080").with_bind_ports(8080, 8080) as srv:
            srv_url = srv._create_connection_url()
            print(f"Service is running at {srv_url}")

            with DockerImage(
                path=APP_DOCKERFILE_PATH,
                clean_up=False,
                tag="deliveroo-app:testcontainers",
            ) as app_image:
                with DockerContainer(image=str(app_image)).with_env(
                    "HOST", srv_url
                ).with_env("LOG_LEVEL", "debug") as app:
                    import time
                    import datetime

                    now = datetime.datetime.now()
                    wait_time = 30

                    while (datetime.datetime.now() - now).seconds < wait_time:
                        print("Waiting for the app to start...")
                        print(app.get_logs())
                        time.sleep(1)


if __name__ == "__main__":
    main()
