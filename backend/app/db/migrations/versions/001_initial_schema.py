"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-09-03

Tables: users, shops, products, wallets, agent_configs
Applied directly via Supabase MCP in Phase 0.
"""

from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            clerk_id TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('vendor', 'consumer')),
            display_name TEXT,
            avatar_config JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS shops (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            domain TEXT NOT NULL CHECK (domain IN (
                'vegetables', 'fruits', 'grocery', 'pharma',
                'electronics', 'furniture', 'bakery'
            )),
            description TEXT,
            banner_url TEXT,
            agent_personality TEXT DEFAULT 'negotiator' CHECK (agent_personality IN (
                'negotiator', 'fixed_mrp', 'loyalty', 'premium'
            )),
            grid_x INT,
            grid_y INT,
            razorpay_linked_account_id TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_shops_vendor_id ON shops(vendor_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            price DECIMAL(10, 2) NOT NULL,
            floor_price DECIMAL(10, 2) NOT NULL,
            mrp DECIMAL(10, 2),
            stock_count INT DEFAULT 0,
            image_url TEXT,
            category TEXT,
            pinecone_vector_id TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS wallets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            balance DECIMAL(10, 2) DEFAULT 0.00,
            razorpay_linked_account_id TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS agent_configs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            agent_type TEXT NOT NULL CHECK (agent_type IN ('vendor', 'consumer', 'scout')),
            domain TEXT,
            personality JSONB DEFAULT '{}',
            negotiation_rules JSONB DEFAULT '{}',
            training_data_url TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_agent_configs_user_id ON agent_configs(user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_configs CASCADE")
    op.execute("DROP TABLE IF EXISTS wallets CASCADE")
    op.execute("DROP TABLE IF EXISTS products CASCADE")
    op.execute("DROP TABLE IF EXISTS shops CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
