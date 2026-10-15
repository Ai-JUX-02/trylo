Add-Type -AssemblyName System.Drawing

# Tauri 2 icon set for src-tauri/tauri.conf.json bundle.icon.
#
# 2026-10-14: replaced the previous placeholder artwork with the
# shipped app-icon recipe — the same one the mobile launcher uses
# and the left-rail brand now wears: #111318 rounded tile + #F3E3A6
# mark at 75% path-box coverage. The mark geometry below is the
# same one Logo.tsx renders (and the same one
# `mobile-app/android/.../trylo_launcher_foreground.xml` ships):
# 3 polylines, 449-unit path box, stroke 60, round caps/joins.
# One Trylo = one mark, three surfaces.
#
# Previous version of this script drew a gold (#d4a017) square with
# a bold "T" — a placeholder that never matched the real brand.

# NB: PowerShell variables are case-insensitive — the colours are named
# *Color so the local $tileSize below can never shadow them (it did, once,
# and the tile silently failed to paint).
$TileColor = [System.Drawing.Color]::FromArgb(0x11, 0x13, 0x18)  # #111318
$MarkColor = [System.Drawing.Color]::FromArgb(0xF3, 0xE3, 0xA6)  # #F3E3A6

# Mark geometry in the 1024 viewBox (mirrors Logo.tsx MARK_PATHS).
$MARK_PATHS = @(
    ,([System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(475, 308),
        [System.Drawing.PointF]::new(475, 444),
        [System.Drawing.PointF]::new(595, 444)))
    ,([System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(337, 675),
        [System.Drawing.PointF]::new(447, 610),
        [System.Drawing.PointF]::new(397, 512)))
    ,([System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(533, 633),
        [System.Drawing.PointF]::new(593, 537),
        [System.Drawing.PointF]::new(715, 607)))
)
$MARK_INK_BOX = 438.0   # INK box = path bbox (378 wide) + round caps (60)
$MARK_STROKE = 60.0     # stroke width in viewBox units
# Optical placement, mirroring Logo.tsx. Centre the INK BBOX on the
# tile (the eye tracks the outline), then lift a few units: the ink
# centroid sits 37u BELOW the bbox centre because the lower half
# carries two heavy chevrons, so a centroid-centred mark reads as
# "pushed to the top" even though its centroid is dead-centre.
# MARK_OPTICAL_LIFT is the owner's pick (option 2 of four, ~0.7%).
$MARK_BBOX_CX = 526.0
$MARK_BBOX_CY = 491.5
$MARK_OPTICAL_LIFT = 3.0

# Coverage is measured on the INK box (what the eye sees), not the
# path box: 0.82 is the owner's pick from the four-way comparison
# sheet (73 / 78 / 82 / 86, with the shipped phone icon at 76).
$COVERAGE = 0.82
$RADIUS_RATIO = 0.22   # corner radius / tile edge (mobile squircle)
$MARGIN_RATIO = 0.04   # transparent margin per side
$OUT_SCALE = 8         # supersample factor for antialiasing (crisp edges)

$outDir = $PSScriptRoot

function New-RoundedRectPath {
    param([single]$x, [single]$y, [single]$w, [single]$h, [single]$r)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Render-Tile {
    param([int]$Size, [double]$StrokeUnits = 0)
    if ($StrokeUnits -eq 0) { $StrokeUnits = $MARK_STROKE }
    # 8x supersampling for crisp edges, but cap the working canvas at
    # 4096px (a 1024 icon at 8x would allocate ~270MB for no visible
    # gain — 4x already lands sub-pixel AA on the 1024 master).
    $ss = [Math]::Min($Size * $OUT_SCALE, 4096)
    $bmp = New-Object System.Drawing.Bitmap $ss, $ss
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $tileSize = $ss * (1 - 2 * $MARGIN_RATIO)
    $tx = ($ss - $tileSize) / 2
    $radius = $tileSize * $RADIUS_RATIO

    $tilePath = New-RoundedRectPath $tx $tx $tileSize $tileSize $radius
    $brush = New-Object System.Drawing.SolidBrush $TileColor
    $g.FillPath($brush, $tilePath)
    $brush.Dispose()
    $tilePath.Dispose()

    # Scale so the mark's path box is COVERAGE of the tile, then centre
    # it on the tile (the path box centre sits off the canvas centre).
    $s = ($tileSize * $COVERAGE) / $MARK_INK_BOX
    $g.TranslateTransform(($tx + $tileSize / 2) - $MARK_BBOX_CX * $s, ($tx + $tileSize / 2) - $MARK_BBOX_CY * $s - $MARK_OPTICAL_LIFT * $s)
    $g.ScaleTransform($s, $s)
    $pen = New-Object System.Drawing.Pen $MarkColor, ([single]$StrokeUnits)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    foreach ($pts in $MARK_PATHS) { $g.DrawLines($pen, $pts) }
    $pen.Dispose()
    $g.Dispose()

    $out = New-Object System.Drawing.Bitmap $Size, $Size
    $g2 = [System.Drawing.Graphics]::FromImage($out)
    $g2.Clear([System.Drawing.Color]::Transparent)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.DrawImage($bmp, 0, 0, $Size, $Size)
    $g2.Dispose()
    $bmp.Dispose()
    return $out
}

function Get-PngBytes {
    param([int]$Size, [double]$StrokeUnits = 0)
    $bmp = Render-Tile -Size $Size -StrokeUnits $StrokeUnits
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    # Leading comma: without it PowerShell unrolls the byte[] into the
    # pipeline and the ico/icns writers get shredded bytes, not a blob.
    , $ms.ToArray()
}

function Write-BE32 {
    param($bw, [uint32]$v)
    $bw.Write([byte](($v -shr 24) -band 0xFF))
    $bw.Write([byte](($v -shr 16) -band 0xFF))
    $bw.Write([byte](($v -shr 8) -band 0xFF))
    $bw.Write([byte]($v -band 0xFF))
}

function Get-StrokeFor {
    param([int]$Size)
    # Optical sizing: at <= 24px the four strokes of the mark muddle
    # into one blob, so the small renditions carry a heavier stroke
    # (~+40%). Standard icon practice; the shipped icon (95px) keeps
    # the source 60.
    if ($Size -le 24) { return $MARK_STROKE * 1.4 }
    return $MARK_STROKE
}

# --- bundle PNGs (tauri.conf.json) ---------------------------------------
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

[System.IO.File]::WriteAllBytes("$outDir\32x32.png", (Get-PngBytes -Size 32))
[System.IO.File]::WriteAllBytes("$outDir\128x128.png", (Get-PngBytes -Size 128))
[System.IO.File]::WriteAllBytes("$outDir\128x128@2x.png", (Get-PngBytes -Size 256))
[System.IO.File]::WriteAllBytes("$outDir\1024x1024.png", (Get-PngBytes -Size 1024))

# --- .ico (Windows): real multi-size container with PNG payloads -------
# Size list matters more than it looks: Windows picks the CLOSEST entry
# and resamples the rest, so a missing slot means blur. A 24px taskbar
# slot at 100/125/150/175/200% scaling asks for 24/30/36/42/48 px; a
# 32px slot asks for 32/40/48/56/64. This machine runs 150% (DPI 144)
# => 36px, which is why the taskbar icon looked soft until it was added.
#
# ORDER matters too — and DESCENDING is required: tauri-codegen embeds
# `entries()[0]` (the FIRST entry) as the runtime window icon at a
# fixed size (tao CreateIcon), and Windows resamples that HICON for
# the taskbar. With ascending order the first entry was 16px, so the
# taskbar upscaled 16px -> 36/48px = "巨糊". Largest first.
$icoSizes = @(256, 192, 128, 96, 64, 56, 48, 40, 36, 32, 30, 24, 20, 16)
$icoEntries = @()
foreach ($s in $icoSizes) { $icoEntries += ,@($s, (Get-PngBytes -Size $s -StrokeUnits (Get-StrokeFor $s))) }
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$icoEntries.Count)
$offset = 6 + 16 * $icoEntries.Count
foreach ($e in $icoEntries) {
    $dim = if ($e[0] -ge 256) { 0 } else { $e[0] }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim)
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$e[1].Length)
    $bw.Write([uint32]$offset)
    $offset += $e[1].Length
}
foreach ($e in $icoEntries) { $bw.Write($e[1]) }
$bw.Flush()
[System.IO.File]::WriteAllBytes("$outDir\icon.ico", $ms.ToArray())
$bw.Dispose(); $ms.Dispose()

# --- .icns (macOS): real container (the old script shipped a bare PNG
#     renamed to .icns, which macOS rejects) ---------------------------
$icnsMap = [ordered]@{
    'icp4' = 16; 'icp5' = 32; 'ic11' = 32; 'ic12' = 64; 'ic07' = 128
    'ic13' = 256; 'ic08' = 256; 'ic14' = 512; 'ic09' = 512; 'ic10' = 1024
}
$chunks = @()
foreach ($k in $icnsMap.Keys) {
    $sz = $icnsMap[$k]
    $bytes = Get-PngBytes -Size $sz -StrokeUnits (Get-StrokeFor $sz)
    $chunks += ,@($k, $bytes)
}
$total = 8
foreach ($c in $chunks) { $total += 8 + $c[1].Length }
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([byte[]][System.Text.Encoding]::ASCII.GetBytes('icns'))
Write-BE32 $bw ([uint32]$total)
foreach ($c in $chunks) {
    $bw.Write([byte[]][System.Text.Encoding]::ASCII.GetBytes($c[0]))
    Write-BE32 $bw ([uint32](8 + $c[1].Length))
    $bw.Write($c[1])
}
$bw.Flush()
[System.IO.File]::WriteAllBytes("$outDir\icon.icns", $ms.ToArray())
$bw.Dispose(); $ms.Dispose()

Get-ChildItem $outDir | Format-Table Name, Length