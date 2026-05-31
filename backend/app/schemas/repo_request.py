from typing import Optional, Literal
from pydantic import BaseModel

class RepoRequest(BaseModel):
    input_type: Literal["local", "remote"]
    path: Optional[str] = None
    url: Optional[str] = None