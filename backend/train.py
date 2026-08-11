"""Train ChangeUNet on paired RGB images and 3-class masks.

Expected layout:
  backend/data/train/before/<id>.png
  backend/data/train/after/<id>.png
  backend/data/train/masks/<id>.png  # pixels: 0=no change, 1=loss, 2=gain
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset, random_split

from app.model import ChangeUNet


class PairedChangeDataset(Dataset):
    def __init__(self, root: Path, size: int = 256, augment: bool = False) -> None:
        self.root, self.size, self.augment = root, size, augment
        self.items = sorted((root / "masks").glob("*.png"))
        if not self.items:
            raise ValueError(f"No mask PNG files found in {root / 'masks'}")

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int):
        name = self.items[index].name
        images = []
        for folder in ("before", "after"):
            image = Image.open(self.root / folder / name).convert("RGB").resize((self.size, self.size))
            images.append(np.asarray(image, dtype=np.float32) / 255.0)
        mask = Image.open(self.items[index]).convert("L").resize((self.size, self.size), Image.Resampling.NEAREST)
        mask_array = np.asarray(mask, dtype=np.int64)
        values = np.concatenate(images, axis=2)
        if self.augment and random.random() < 0.5:
            values, mask_array = np.flip(values, 1).copy(), np.flip(mask_array, 1).copy()
        return torch.from_numpy(values.transpose(2, 0, 1)), torch.from_numpy(mask_array.copy())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path(__file__).parent / "data" / "train")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "checkpoints" / "change_unet.pt")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    args = parser.parse_args()

    dataset = PairedChangeDataset(args.data, augment=True)
    validation_size = max(1, round(len(dataset) * 0.2)) if len(dataset) > 4 else 0
    train_size = len(dataset) - validation_size
    train_set, validation_set = random_split(dataset, [train_size, validation_size])
    loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=True, num_workers=0)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ChangeUNet().to(device)
    # Changed pixels are normally rare; class weighting reduces all-background predictions.
    criterion = nn.CrossEntropyLoss(weight=torch.tensor([1.0, 4.0, 4.0], device=device))
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)

    for epoch in range(args.epochs):
        model.train(); running_loss = 0.0
        for inputs, targets in loader:
            inputs, targets = inputs.to(device), targets.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(inputs), targets)
            loss.backward(); optimizer.step(); running_loss += loss.item() * inputs.size(0)
        print(f"epoch={epoch + 1:02d} train_loss={running_loss / train_size:.4f}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), args.output)
    print(f"saved={args.output} validation_samples={validation_size}")


if __name__ == "__main__":
    main()

