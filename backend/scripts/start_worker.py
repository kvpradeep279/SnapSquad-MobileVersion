from redis import Redis
from rq import Worker

from app.core.config import settings


if __name__ == "__main__":
    conn = Redis.from_url(settings.redis_url)
    worker = Worker(["pipeline"], connection=conn)
    worker.work()
