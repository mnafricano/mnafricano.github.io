# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_submodules

analysis = Analysis(
    ["erome_archiver/desktop.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=collect_submodules("hachoir"),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "cognitive_multiplexer",
        "IPython",
        "pygments",
        "pytest",
        "setuptools",
    ],
    noarchive=False,
)
pyz = PYZ(analysis.pure)

executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="Erome Archiver",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    target_arch="arm64",
)
collection = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="Erome Archiver",
)
app = BUNDLE(
    collection,
    name="Erome Archiver.app",
    bundle_identifier="com.mnafricano.erome-archiver",
    info_plist={
        "CFBundleDisplayName": "Erome Archiver",
        "CFBundleName": "Erome Archiver",
        "CFBundleShortVersionString": "0.1.0",
        "CFBundleVersion": "1",
        "LSMinimumSystemVersion": "13.0",
        "NSHighResolutionCapable": True,
    },
)
