# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# Collect all FastAPI, SQLAlchemy, and other dependencies
datas = []
binaries = []
hiddenimports = []

# Collect FastAPI and dependencies
for package in ['fastapi', 'uvicorn', 'sqlalchemy', 'alembic', 'pydantic', 'starlette']:
    tmp_datas, tmp_binaries, tmp_hiddenimports = collect_all(package)
    datas += tmp_datas
    binaries += tmp_binaries
    hiddenimports += tmp_hiddenimports

# Add our app files
datas += [
    ('app', 'app'),
    ('../database/schema', 'database/schema'),
    ('../database/migrations', 'database/migrations'),
    ('requirements.txt', '.')
]

# Additional hidden imports
hiddenimports += [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'sqlalchemy.sql.default_comparator',
    'asyncpg',
    'psycopg2',
    'sqlite3',
    'passlib.handlers',
    'passlib.handlers.bcrypt',
    'jose',
    'cryptography',
    'multipart',
    'bcrypt',
    'cffi'
]

a = Analysis(
    ['app/main.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='pharma-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='../desktop/assets/icon.ico'
)