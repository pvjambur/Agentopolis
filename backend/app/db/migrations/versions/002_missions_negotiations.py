"""missions and negotiations tables

Revision ID: 002
Revises: 001
Create Date: 2026-09-05

Tables: missions, negotiations
Applied directly via Supabase MCP in Phase 2.
"""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS missions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            consumer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            instruction_text TEXT NOT NULL,
            parsed_list JSONB DEFAULT '[]',
            budget DECIMAL(10, 2),
            mode TEXT DEFAULT 'single' CHECK (mode IN ('single', 'swarm')),
            status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'failed')),
            created_at TIMESTAMPTZ DEFAULT now(),
            completed_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_missions_consumer_id ON missions(consumer_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS negotiations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
            shop_id UUID NOT NULL REFERENCES shops(id),
            product_id UUID NOT NULL REFERENCES products(id),
            item_requested TEXT NOT NULL,
            rounds JSONB DEFAULT '[]',
            outcome TEXT CHECK (outcome IN ('deal', 'no_deal', 'walked_away', 'blocked')),
            opening_price DECIMAL(10, 2),
            final_price DECIMAL(10, 2),
            round_count INT DEFAULT 0,
            is_mocked_payment BOOLEAN DEFAULT true,
            mock_transaction_ref TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            completed_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_negotiations_mission_id ON negotiations(mission_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_negotiations_shop_id ON negotiations(shop_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS negotiations CASCADE")
    op.execute("DROP TABLE IF EXISTS missions CASCADE")
