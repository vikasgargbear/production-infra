"""
Base CRUD operations
"""
from typing import Any, Dict, Generic, List, Optional, Type, TypeVar, Union
from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..core.database import Base

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

def create_crud(model: Type[ModelType]):
    """Create a CRUD instance for a model"""
    
    class CRUDBase:
        def __init__(self, model: Type[ModelType]):
            self.model = model
        
        def get(self, db: Session, id: Any) -> Optional[ModelType]:
            return db.query(self.model).filter(self.model.id == id).first()
        
        def get_multi(
            self, db: Session, *, skip: int = 0, limit: int = 100
        ) -> List[ModelType]:
            return db.query(self.model).offset(skip).limit(limit).all()
        
        def create(self, db: Session, *, obj_in: CreateSchemaType) -> ModelType:
            obj_in_data = dict(obj_in)
            db_obj = self.model(**obj_in_data)
            db.add(db_obj)
            db.commit()
            db.refresh(db_obj)
            return db_obj
        
        def update(
            self,
            db: Session,
            *,
            db_obj: ModelType,
            obj_in: Union[UpdateSchemaType, Dict[str, Any]]
        ) -> ModelType:
            if isinstance(obj_in, dict):
                update_data = obj_in
            else:
                update_data = obj_in.dict(exclude_unset=True)
            for field in update_data:
                setattr(db_obj, field, update_data[field])
            db.add(db_obj)
            db.commit()
            db.refresh(db_obj)
            return db_obj
        
        def remove(self, db: Session, *, id: Any) -> ModelType:
            obj = db.query(self.model).get(id)
            db.delete(obj)
            db.commit()
            return obj
    
    return CRUDBase(model)