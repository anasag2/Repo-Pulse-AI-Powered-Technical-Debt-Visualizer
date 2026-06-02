from importlib.metadata import files
from fastapi import APIRouter, HTTPException
from app.schemas.repo_request import RepoRequest
from app.services.repo_validator import validate_local_repository
from app.services.repo_ingestion import clone_remote_repository
from app.services.git_mining import get_tracked_files

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
        success, message, tracked_files = get_tracked_files(request.path)
        if not success:
            raise HTTPException(
                status_code=400,
                detail=message
            )
        return{
            "status": "validated",
            "input_type": "local",
            "path": request.path,
            "message": message,
            "file_count": len(tracked_files),
            "tracked_files": files[:10] # Return first 10 tracked files as a sample
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
        success, mining_message, files = get_tracked_files(local_path)

        if not success:
            raise HTTPException(
                status_code=400,
                detail=mining_message
            )
        return{
            "status": "cloned",
            "input_type": "remote",
            "url": request.url,
            "local_path": local_path,
            "message": message,
            "file_count": len(files),
            "tracked_files": files[:10] # Return first 10 tracked files as a sample
        }
    raise HTTPException(
        status_code=400,
        detail="Invalid input type."
    )