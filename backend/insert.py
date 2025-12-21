import csv
import random
from datetime import datetime

def generate_test_csv(filename="test_products.csv", num_records=500000):
    print(f"Generating {num_records:,} product records...")

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
        "Ultra", "Mega", "Super", "Advanced", "Basic", "Elite"
    ]

    with open(filename, "w", newline="", encoding="utf-8") as csvfile:
        fieldnames = ["sku", "name", "description", "price", "active"]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()

        for i in range(1, num_records + 1):
            category = random.choice(categories)
            brand = random.choice(brands)
            adjective = random.choice(adjectives)

            sku = f"{brand.upper()[:4]}-{category.upper()[:3]}-{i:06d}"
            name = f"{brand} {adjective} {category} Item {i}"

            description = (
                f"High-quality {adjective.lower()} {category.lower()} product from {brand}. "
                f"Perfect for all your {category.lower()} needs."
            )

            price = round(random.uniform(5.00, 9999.99), 2)
            active = random.choice([True, True, True, False])  # ~75% active

            writer.writerow({
                "sku": sku,
                "name": name,
                "description": description,
                "price": price,
                "active": active
            })

            if i % 50_000 == 0:
                print(f"  Generated {i:,} records...")

    print(f"✅ CSV generated: {filename}")
    print(f"   Approx size: {(num_records * 220) / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    print("Choose CSV size:")
    print("1. Small (1,000)")
    print("2. Medium (10,000)")
    print("3. Large (100,000)")
    print("4. Extra Large (500,000)")

    choice = input("Enter choice (1-4): ").strip()

    sizes = {
        "1": (1000, "products_small.csv"),
        "2": (10000, "products_medium.csv"),
        "3": (100000, "products_large.csv"),
        "4": (500000, "products_xlarge.csv"),
    }

    num_records, filename = sizes.get(choice, (1000, "products_small.csv"))
    generate_test_csv(filename, num_records)
