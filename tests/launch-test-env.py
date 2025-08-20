#!/usr/bin/env python3

# Here we setup the environment for the tests.
# Inside ./Deliveroo.js/backend/ we have a node project which we will launch,
# for the time being without updatating the .env file. This will spawn a http
# server which will be our benchmark target.

from pathlib import Path

from testcontainers.core.image import DockerImage
from testcontainers.generic import ServerContainer

ADMIN_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6ImFkbWluIiwidGVhbUlkIjowLCJ0ZWFtTmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzU1NzA5MjM2fQ.14P--E6hePoqLFCqlbb_TA5kRWbNs7PtBde9E5aC-_Q"
DOCKERFILE_PATH = Path(__file__).parent / "Deliveroo"


def main():
    with DockerImage(path=DOCKERFILE_PATH) as image:
        with ServerContainer(port=8080, image=image) as srv:

            url = srv._create_connection_url()
            print(f"Service is running at {url}")
            import time

            time.sleep(30)


if __name__ == "__main__":
    main()
