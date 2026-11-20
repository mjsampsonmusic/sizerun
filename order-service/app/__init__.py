"""SizeRun order service: takes store orders and reserves their stock through the inventory service."""

import os

from flask import Flask
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import sessionmaker

from .api import bp
from .db import Base, close_session
from .inventory import InventoryClient

DEFAULT_DATABASE_URL = "postgresql+psycopg://sizerun:sizerun@localhost:5432/orders"


def create_app(config: dict | None = None, inventory_client=None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        DATABASE_URL=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
        INVENTORY_URL=os.environ.get("INVENTORY_URL", "http://localhost:8080"),
        INVENTORY_TIMEOUT_SECONDS=float(os.environ.get("INVENTORY_TIMEOUT_SECONDS", "3")),
    )
    app.config.update(config or {})

    engine = create_engine(app.config["DATABASE_URL"], pool_pre_ping=True)
    _create_schema(engine)
    app.extensions["db_engine"] = engine
    app.extensions["db_sessions"] = sessionmaker(bind=engine, expire_on_commit=False)
    app.extensions["inventory"] = inventory_client or InventoryClient(
        app.config["INVENTORY_URL"], timeout=app.config["INVENTORY_TIMEOUT_SECONDS"]
    )

    app.teardown_appcontext(close_session)
    app.register_blueprint(bp)
    return app


def _create_schema(engine: Engine) -> None:
    """Creates the tables if they are missing. The advisory lock lets several replicas start at once."""
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(7243)"))
        Base.metadata.create_all(connection)
