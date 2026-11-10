"""Recreate the bundled TTFs from the installed, locked Fontsource packages."""
from pathlib import Path
from shutil import copyfile

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

destination = Path(__file__).resolve().parent
workspace = destination.parents[2]
for package, family in [("source-serif-4", "SourceSerif4"), ("geist", "Geist")]:
    source = workspace / "node_modules" / "@fontsource-variable" / package
    copyfile(source / "LICENSE", destination / f"{family}-OFL.txt")
    for style, suffix in [("normal", ""), ("italic", "Italic")]:
        filename = source / "files" / f"{package}-latin-wght-{style}.woff2"
        for weight, name in [(400, suffix or "Regular"), (700, "Bold" + suffix)]:
            font = TTFont(filename)
            axes = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
            axes["wght"] = weight
            font = instantiateVariableFont(font, axes, inplace=True)
            font.flavor = None
            font.save(destination / f"{family}-{name}.ttf")
