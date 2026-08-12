param([string]$service = "")
if ($service -eq "") { docker compose logs -f } else { docker compose logs -f $service }
