from flask import current_app, g
from sqlalchemy.orm import DeclarativeBase, Session


class Base(DeclarativeBase):
    pass


def get_session() -> Session:
    """One database session per request, closed when the request ends."""
    if "db_session" not in g:
        g.db_session = current_app.extensions["db_sessions"]()
    return g.db_session


def close_session(exc: BaseException | None) -> None:
    session = g.pop("db_session", None)
    if session is not None:
        if exc is not None:
            session.rollback()
        session.close()
