from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0034_typsttemplate"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE impress_typst_template
                DROP COLUMN IF EXISTS shared_team;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
