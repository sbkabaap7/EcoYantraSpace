"""Optional trainable neural network for paired-image change segmentation."""

from __future__ import annotations

try:
    import torch
    from torch import nn
except ImportError:  # The API baseline does not require the large PyTorch package.
    torch = None
    nn = None


if nn is not None:
    class ConvBlock(nn.Module):
        def __init__(self, input_channels: int, output_channels: int) -> None:
            super().__init__()
            self.layers = nn.Sequential(
                nn.Conv2d(input_channels, output_channels, 3, padding=1),
                nn.BatchNorm2d(output_channels),
                nn.ReLU(inplace=True),
                nn.Conv2d(output_channels, output_channels, 3, padding=1),
                nn.BatchNorm2d(output_channels),
                nn.ReLU(inplace=True),
            )

        def forward(self, x):
            return self.layers(x)


    class ChangeUNet(nn.Module):
        """Small U-Net taking RGB-before + RGB-after (6 channels).

        Output classes are 0=no change, 1=forest loss, and 2=forest gain.
        """

        def __init__(self, base_channels: int = 32, classes: int = 3) -> None:
            super().__init__()
            b = base_channels
            self.pool = nn.MaxPool2d(2)
            self.enc1 = ConvBlock(6, b)
            self.enc2 = ConvBlock(b, b * 2)
            self.enc3 = ConvBlock(b * 2, b * 4)
            self.bottleneck = ConvBlock(b * 4, b * 8)
            self.up3 = nn.ConvTranspose2d(b * 8, b * 4, 2, stride=2)
            self.dec3 = ConvBlock(b * 8, b * 4)
            self.up2 = nn.ConvTranspose2d(b * 4, b * 2, 2, stride=2)
            self.dec2 = ConvBlock(b * 4, b * 2)
            self.up1 = nn.ConvTranspose2d(b * 2, b, 2, stride=2)
            self.dec1 = ConvBlock(b * 2, b)
            self.head = nn.Conv2d(b, classes, 1)

        def forward(self, x):
            e1 = self.enc1(x)
            e2 = self.enc2(self.pool(e1))
            e3 = self.enc3(self.pool(e2))
            middle = self.bottleneck(self.pool(e3))
            d3 = self.dec3(torch.cat((self.up3(middle), e3), dim=1))
            d2 = self.dec2(torch.cat((self.up2(d3), e2), dim=1))
            d1 = self.dec1(torch.cat((self.up1(d2), e1), dim=1))
            return self.head(d1)
else:
    class ChangeUNet:  # pragma: no cover - helpful error for optional dependency
        def __init__(self, *args, **kwargs) -> None:
            raise RuntimeError("Install requirements-ml.txt to use ChangeUNet")

