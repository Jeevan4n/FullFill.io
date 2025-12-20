import csv
import random
from datetime import datetime

def generate_test_csv(filename="test_products.csv", num_records=500000):
    """
    Generate a test CSV file with product data
    Args:
        filename: Output CSV filename
        num_records: Number of product records to generate
    """
    print(f"Generating {num_records} product records...")
    
    categories = [
        "Electronics", "Clothing", "Home & Garden", "Sports & Outdoors",
        "Books", "Toys & Games", "Health & Beauty", "Automotive",
        "Office Supplies", "Pet Supplies", "Jewelry", "Food & Beverage"
    ]
    
    brands = [
        "Acme", "TechPro", "StyleCo", "HomeEssentials", "FitGear",
        "BookWorld", "ToysRUs", "BeautyPlus", "AutoParts", "OfficeMax",
        "PetCare", "JewelCraft", "FoodMart", "GadgetHub", "FashionZone"
    ]
    
    adjectives = [
        "Premium", "Deluxe", "Professional", "Standard", "Economy",
        "Ultra", "Mega", "Super", "Advanced", "Basic", "Elite",
        "Classic", "Modern", "Vintage", "Smart", "Pro"
    ]
    
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = ['sku', 'name', 'description']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        
        writer.writeheader()
        
        for i in range(1, num_records + 1):
            category = random.choice(categories)
            brand = random.choice(brands)
            adjective = random.choice(adjectives)
            
            # Generate SKU (format: BRAND-CAT-XXXXX)
            sku = f"{brand.upper()[:4]}-{category.upper()[:3]}-{i:06d}"
            
            # Generate product name
            name = f"{brand} {adjective} {category} Item {i}"
            
            # Generate description
            description = f"High-quality {adjective.lower()} {category.lower()} product from {brand}. " \
                         f"Perfect for all your {category.lower()} needs. " \
                         f"SKU: {sku}. Item number: {i}."
            
            writer.writerow({
                'sku': sku,
                'name': name,
                'description': description
            })
            
            # Progress indicator
            if i % 50000 == 0:
                print(f"  Generated {i:,} records...")
    
    print(f"✅ Successfully generated {num_records:,} records in '{filename}'")
    print(f"   File size: ~{num_records * 200 / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    # Generate different sizes for testing
    print("Choose CSV size to generate:")
    print("1. Small (1,000 records) - for quick testing")
    print("2. Medium (10,000 records) - for medium testing")
    print("3. Large (100,000 records) - for load testing")
    print("4. Extra Large (500,000 records) - for full scale testing")
    
    choice = input("Enter choice (1-4) or press Enter for default (1000): ").strip()
    
    sizes = {
        '1': (1000, 'test_products_small.csv'),
        '2': (10000, 'test_products_medium.csv'),
        '3': (100000, 'test_products_large.csv'),
        '4': (500000, 'test_products_xlarge.csv'),
    }
    
    if choice in sizes:
        num_records, filename = sizes[choice]
    else:
        num_records, filename = 1000, 'test_products_small.csv'
    
    generate_test_csv(filename, num_records)
