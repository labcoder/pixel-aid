from .nodes import (
    PixelAidExportBundle,
    PixelAidFixSprite,
    PixelAidInspect,
    PixelAidPaletteReport,
)


NODE_CLASS_MAPPINGS = {
    "PixelAidInspect": PixelAidInspect,
    "PixelAidFixSprite": PixelAidFixSprite,
    "PixelAidPaletteReport": PixelAidPaletteReport,
    "PixelAidExportBundle": PixelAidExportBundle,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PixelAidInspect": "PixelAid Inspect",
    "PixelAidFixSprite": "PixelAid Fix Sprite",
    "PixelAidPaletteReport": "PixelAid Palette Report",
    "PixelAidExportBundle": "PixelAid Export Bundle",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
