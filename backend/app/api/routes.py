from fastapi import APIRouter, HTTPException
from app.schemas.repo_request import RepoRequest
from app.services.repo_validator import validate_local_repository
from app.services.repo_ingestion import clone_remote_repository

router = APIRouter()

@router.post("/analyze-repo")
def analyze_repo(request: RepoRequest):
    if request.input_type  == "local":
        if not request.path:
            raise HTTPException(
                status_code=400,
                detail="Local repository path is required."
            )
        is_valid, message = validate_local_repository(request.path)

        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=message
            )
        return{
            "status": "validated",
            "input_type": "local",
            "path": request.path,
            "message": message
        }
    if request.input_type == "remote":
        if not request.url:
            raise HTTPException(
                status_code=400,
                detail="Remote repository URL is required."
            )
        success, message, local_path = clone_remote_repository(request.url)
        if not success:
            raise HTTPException(
                status_code=400,
                detail=message
            )
        return{
            "status": "cloned",
            "input_type": "remote",
            "url": request.url,
            "local_path": local_path,
            "message": message
        }
    raise HTTPException(
        status_code=400,
        detail="Invalid input type."
    )