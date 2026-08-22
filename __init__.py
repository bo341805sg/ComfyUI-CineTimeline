from .plan_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from . import routes as _routes  # noqa: F401 - registers HTTP assembly routes

WEB_DIRECTORY = "./web_v82"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
