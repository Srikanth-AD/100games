#!/usr/bin/env python3
"""Generate preview images for games 26, 27, and 28"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_seesaw_preview():
    """Create preview for Game 26 - See-Saw Balance"""
    img = Image.new('RGB', (600, 400), color=(102, 126, 234))
    draw = ImageDraw.Draw(img)
    
    # Draw gradient background
    for y in range(400):
        r = int(102 + (118 - 102) * (y / 400))
        g = int(126 + (75 - 126) * (y / 400))
        b = int(234 + (162 - 234) * (y / 400))
        draw.line([(0, y), (600, y)], fill=(r, g, b))
    
    # Ground
    draw.rectangle([(0, 260), (600, 400)], fill=(144, 238, 144))
    
    # Fulcrum
    points = [(270, 260), (330, 260), (320, 220), (280, 220)]
    draw.polygon(points, fill=(139, 69, 19))
    
    # Beam (rotated slightly)
    beam_points = [(250, 220), (350, 215), (348, 235), (252, 240)]
    draw.polygon(beam_points, fill=(255, 215, 0))
    
    # Left weight
    draw.rectangle([(140, 180), (180, 220)], fill=(255, 107, 107))
    draw.text((160, 195), "2kg", fill=(255, 255, 255))
    
    # Right weight
    draw.rectangle([(420, 175), (460, 215)], fill=(78, 205, 196))
    draw.text((440, 190), "3kg", fill=(255, 255, 255))
    
    # Prize/Gift box
    draw.rectangle([(270, 100), (330, 160)], fill=(255, 215, 0))
    draw.rectangle([(300, 100), (310, 160)], fill=(255, 105, 180))
    
    # Title
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 56)
        draw.text((300, 30), "SEE-SAW", fill=(255, 255, 255), anchor="mm", font=font)
    except:
        draw.text((300, 30), "SEE-SAW", fill=(255, 255, 255))
    
    return img

def create_paddlerace_preview():
    """Create preview for Game 27 - Paddle Board Racing"""
    img = Image.new('RGB', (600, 400), color=(135, 206, 235))
    draw = ImageDraw.Draw(img)
    
    # Draw gradient background
    for y in range(400):
        b_val = int(235 - (45 * (y / 400)))
        draw.line([(0, y), (600, y)], fill=(135, 206, b_val))
    
    # Wave pattern
    for y in range(0, 400, 25):
        draw.line([(0, y), (600, y)], fill=(200, 230, 255, 40))
    
    # Finish line
    for x in range(510, 530, 10):
        draw.rectangle([(x, 0), (x + 10, 400)], fill=(255, 215, 0))
    
    # Player board
    draw.ellipse([(150, 160), (230, 220)], fill=(255, 107, 107))
    draw.text((190, 190), "🏄", fill=(255, 255, 255))
    
    # AI board
    draw.ellipse([(450, 220), (530, 280)], fill=(78, 205, 196))
    draw.text((490, 250), "🤖", fill=(255, 255, 255))
    
    # Wind indicators
    for i in range(3):
        draw.line([(420 + i*20, 50), (420 + i*20 - 15, 40)], fill=(255, 105, 180), width=3)
    
    # Speed lines for player
    for i in range(3):
        draw.line([(90 + i*10, 140), (80 + i*10, 120)], fill=(255, 107, 107), width=3)
    
    # Title
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 44)
        draw.text((300, 50), "PADDLE RACE", fill=(255, 255, 255), anchor="mm", font=font)
    except:
        draw.text((300, 50), "PADDLE RACE", fill=(255, 255, 255))
    
    return img

def create_wellclimb_preview():
    """Create preview for Game 28 - Well Climb"""
    img = Image.new('RGB', (600, 400), color=(45, 45, 45))
    draw = ImageDraw.Draw(img)
    
    # Brick pattern
    for y in range(0, 400, 25):
        for x in range((y // 25) % 2 * 40, 600, 80):
            draw.rectangle([(x, y), (x + 80, y + 25)], outline=(0, 0, 0))
    
    # Water at bottom
    for y in range(320, 400):
        alpha = int(100 * ((y - 320) / 80))
        draw.line([(0, y), (600, y)], fill=(0, 100, 200))
    
    # Spikes at bottom
    for x in range(0, 600, 20):
        draw.polygon([(x, 400), (x + 10, 375), (x + 20, 400)], fill=(255, 107, 107))
    
    # Player (climber)
    draw.ellipse([(280, 120), (320, 160)], fill=(255, 107, 107))
    draw.text((300, 140), "🧗", fill=(255, 255, 255))
    
    # Rock hazard
    draw.ellipse([(130, 200), (160, 230)], fill=(139, 69, 19))
    draw.text((145, 215), "🪨", fill=(255, 255, 255))
    
    # Spider hazard
    draw.ellipse([(430, 220), (470, 260)], fill=(51, 51, 51))
    draw.text((450, 240), "🕷️", fill=(255, 255, 255))
    
    # Collectible (energy)
    draw.ellipse([(270, 40), (310, 80)], fill=(255, 215, 0))
    draw.text((290, 60), "⚡", fill=(255, 255, 255))
    
    # Depth meter
    draw.rectangle([(30, 340), (570, 352)], fill=(64, 64, 64))
    draw.rectangle([(30, 340), (240, 352)], fill=(46, 204, 113))
    
    # Title
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 48)
        draw.text((300, 300), "WELL CLIMB", fill=(255, 255, 255), anchor="mm", font=font)
    except:
        draw.text((300, 300), "WELL CLIMB", fill=(255, 255, 255))
    
    return img

def main():
    base_path = '/Users/srikanthad/Documents/GitHub/100games'
    
    # Create previews
    print("Generating preview images...")
    
    seesaw_img = create_seesaw_preview()
    seesaw_path = os.path.join(base_path, 'game-26-seesaw', 'seesaw-preview.png')
    seesaw_img.save(seesaw_path)
    print(f"✓ Created {seesaw_path}")
    
    paddlerace_img = create_paddlerace_preview()
    paddlerace_path = os.path.join(base_path, 'game-27-paddlerace', 'paddlerace-preview.png')
    paddlerace_img.save(paddlerace_path)
    print(f"✓ Created {paddlerace_path}")
    
    wellclimb_img = create_wellclimb_preview()
    wellclimb_path = os.path.join(base_path, 'game-28-wellclimb', 'wellclimb-preview.png')
    wellclimb_img.save(wellclimb_path)
    print(f"✓ Created {wellclimb_path}")
    
    print("\nAll preview images generated successfully!")

if __name__ == '__main__':
    main()
