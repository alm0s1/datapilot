from typing import List
from uuid import UUID
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.dashboard import Dashboard, DashboardWidget
from app.models.user import User
from app.schemas.dashboard import (
    DashboardCreate, DashboardResponse, DashboardUpdate, DashboardListResponse,
    WidgetCreate, WidgetUpdate, WidgetResponse,
)

router = APIRouter(prefix="/dashboards", tags=["Dashboards"])


@router.get("", response_model=List[DashboardListResponse])
async def list_dashboards(
    collection_id: UUID = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Dashboard).filter(Dashboard.is_archived == False)
    if collection_id:
        q = q.filter(Dashboard.collection_id == collection_id)
    return q.order_by(Dashboard.updated_at.desc()).offset(skip).limit(limit).all()


@router.get("/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(
    dashboard_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.post("", response_model=DashboardResponse, status_code=status.HTTP_201_CREATED)
async def create_dashboard(
    data: DashboardCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dashboard = Dashboard(
        **data.model_dump(),
        created_by_id=current_user.id,
    )
    db.add(dashboard)
    db.commit()
    db.refresh(dashboard)
    return dashboard


@router.put("/{dashboard_id}", response_model=DashboardResponse)
async def update_dashboard(
    dashboard_id: UUID,
    data: DashboardUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(dashboard, field, value)
    db.commit()
    db.refresh(dashboard)
    return dashboard


@router.delete("/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    dashboard.is_archived = True
    db.commit()
    return {"message": "Dashboard archived"}


@router.post("/{dashboard_id}/widgets", response_model=WidgetResponse, status_code=status.HTTP_201_CREATED)
async def add_widget(
    dashboard_id: UUID,
    data: WidgetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    widget = DashboardWidget(
        dashboard_id=dashboard_id,
        **data.model_dump(),
    )
    db.add(widget)
    db.commit()
    db.refresh(widget)
    return widget


@router.put("/{dashboard_id}/widgets/{widget_id}", response_model=WidgetResponse)
async def update_widget(
    dashboard_id: UUID,
    widget_id: UUID,
    data: WidgetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    widget = db.query(DashboardWidget).filter(
        DashboardWidget.id == widget_id,
        DashboardWidget.dashboard_id == dashboard_id,
    ).first()
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(widget, field, value)
    db.commit()
    db.refresh(widget)
    return widget


@router.delete("/{dashboard_id}/widgets/{widget_id}")
async def remove_widget(
    dashboard_id: UUID,
    widget_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    widget = db.query(DashboardWidget).filter(
        DashboardWidget.id == widget_id,
        DashboardWidget.dashboard_id == dashboard_id,
    ).first()
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")
    db.delete(widget)
    db.commit()
    return {"message": "Widget removed"}


@router.post("/{dashboard_id}/share")
async def share_dashboard(
    dashboard_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    dashboard.is_public = True
    dashboard.public_token = secrets.token_urlsafe(32)
    db.commit()
    return {"public_token": dashboard.public_token}


@router.post("/{dashboard_id}/duplicate", response_model=DashboardResponse)
async def duplicate_dashboard(
    dashboard_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    original = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    new_dashboard = Dashboard(
        name=f"{original.name} (Copy)",
        description=original.description,
        layout_config=original.layout_config,
        filter_config=original.filter_config,
        collection_id=original.collection_id,
        created_by_id=current_user.id,
    )
    db.add(new_dashboard)
    db.flush()

    for widget in original.widgets:
        new_widget = DashboardWidget(
            dashboard_id=new_dashboard.id,
            query_id=widget.query_id,
            visualization_id=widget.visualization_id,
            widget_type=widget.widget_type,
            position_x=widget.position_x,
            position_y=widget.position_y,
            width=widget.width,
            height=widget.height,
            config=widget.config,
        )
        db.add(new_widget)

    db.commit()
    db.refresh(new_dashboard)
    return new_dashboard
