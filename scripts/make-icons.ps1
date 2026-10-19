# Génère les icônes de l'app (assets/*.ico et *.png) avec GDI+.
# Usage : powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1

Add-Type -AssemblyName System.Drawing

$assets = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Force $assets | Out-Null

$script:logo = [System.Drawing.Image]::FromFile((Resolve-Path (Join-Path $assets 'lofigirl-logo.png')))

function New-IconBitmap([int]$size, [double]$logoScale = 0.84) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = [single]$size
    # Carré arrondi en dégradé violet -> rose
    $d = $s * 0.48
    $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bg.AddArc(0, 0, $d, $d, 180, 90)
    $bg.AddArc($s - $d, 0, $d, $d, 270, 90)
    $bg.AddArc($s - $d, $s - $d, $d, $d, 0, 90)
    $bg.AddArc(0, $s - $d, $d, $d, 90, 90)
    $bg.CloseFigure()
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF 0, 0),
        (New-Object System.Drawing.PointF $s, $s),
        [System.Drawing.Color]::FromArgb(255, 0x6A, 0x4C, 0xF0),
        [System.Drawing.Color]::FromArgb(255, 0xFF, 0x8F, 0xAB))
    $g.FillPath($grad, $bg)

    # Logo Lofi Girl (rond, fond transparent) centré dans le carré
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $logoSize = $s * $logoScale
    $offset = ($s - $logoSize) / 2
    $g.DrawImage($script:logo, [single]$offset, [single]$offset, [single]$logoSize, [single]$logoSize)

    $g.Dispose()
    return $bmp
}

function Get-PngBytes([int]$size, [double]$logoScale = 0.84) {
    $bmp = New-IconBitmap $size $logoScale
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    return , $ms.ToArray()
}

# Entrée ICO classique (BMP 32 bits) : lue par tous les outils Windows, contrairement au PNG.
function Get-DibBytes([int]$size, [double]$logoScale) {
    $bmp = New-IconBitmap $size $logoScale
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $pixels = New-Object byte[] ($data.Stride * $size)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $pixels, 0, $pixels.Length)
    $bmp.UnlockBits($data)
    $bmp.Dispose()

    $maskStride = [int]([math]::Ceiling($size / 32) * 4)
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter $ms
    $bw.Write([UInt32]40)
    $bw.Write([Int32]$size)
    $bw.Write([Int32]($size * 2)) # image + masque
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]0)
    $bw.Write([UInt32]($size * $size * 4 + $maskStride * $size))
    $bw.Write([Int32]0); $bw.Write([Int32]0); $bw.Write([UInt32]0); $bw.Write([UInt32]0)
    for ($y = $size - 1; $y -ge 0; $y--) { $bw.Write($pixels, $y * $data.Stride, $size * 4) } # lignes de bas en haut
    $bw.Write((New-Object byte[] ($maskStride * $size)))
    $bw.Flush()
    return , $ms.ToArray()
}

function Write-Ico([string]$path, [int[]]$sizes, [double]$logoScale = 0.84) {
    $images = New-Object 'System.Collections.Generic.List[byte[]]'
    foreach ($size in $sizes) {
        if ($size -ge 128) { $images.Add((Get-PngBytes $size $logoScale)) } else { $images.Add((Get-DibBytes $size $logoScale)) }
    }

    $fs = [System.IO.File]::Create($path)
    $bw = New-Object System.IO.BinaryWriter $fs
    $bw.Write([UInt16]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $dim = [byte]($sizes[$i] % 256) # 256 s'écrit 0
        $bw.Write($dim)
        $bw.Write($dim)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([UInt16]1)
        $bw.Write([UInt16]32)
        $bw.Write([UInt32]$images[$i].Length)
        $bw.Write([UInt32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($img in $images) { $bw.Write($img) }
    $bw.Close()
}

Write-Ico (Join-Path $assets 'icon.ico') @(16, 24, 32, 48, 64, 128, 256)
# Dans la zone de notification l'icône est minuscule : le logo prend plus de place.
Write-Ico (Join-Path $assets 'tray.ico') @(16, 20, 24, 32, 40, 48, 64) 0.94
[System.IO.File]::WriteAllBytes((Join-Path $assets 'icon-64.png'), (Get-PngBytes 64))
[System.IO.File]::WriteAllBytes((Join-Path $assets 'icon.png'), (Get-PngBytes 512))

# Android : premier plan de l'icône adaptative (logo seul sur fond transparent, 108 dp,
# dans la zone sûre de 66 dp). Le dégradé de fond est dans res/drawable/ic_launcher_background.xml.
$res = Join-Path $PSScriptRoot '..\android\app\src\main\res'
$densities = @{ 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }
foreach ($density in $densities.Keys) {
    $size = $densities[$density]
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $logoSize = $size * 64 / 108
    $offset = ($size - $logoSize) / 2
    $g.DrawImage($script:logo, [single]$offset, [single]$offset, [single]$logoSize, [single]$logoSize)
    $g.Dispose()
    $dir = Join-Path $res "mipmap-$density"
    New-Item -ItemType Directory -Force $dir | Out-Null
    $bmp.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$script:logo.Dispose()
Write-Host "Icons written to $assets"
