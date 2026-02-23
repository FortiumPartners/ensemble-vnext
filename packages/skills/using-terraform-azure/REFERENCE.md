# Terraform Azure Comprehensive Reference

**Version**: 1.0.0 | **Purpose**: Complete reference for Azure infrastructure with Terraform azurerm 4.x

---

## Table of Contents

1. [Multi-Environment Module Structure](#multi-environment-module-structure)
2. [Networking Patterns](#networking-patterns)
3. [App Service and Azure Functions Infrastructure](#app-service-and-azure-functions-infrastructure)
4. [Azure SQL with Private Endpoints](#azure-sql-with-private-endpoints)
5. [Service Bus Infrastructure](#service-bus-infrastructure)
6. [State Management Best Practices](#state-management-best-practices)

---

## Multi-Environment Module Structure

### Directory Layout

```
infrastructure/
├── modules/
│   ├── networking/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── security/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── application/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── data/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── env/
│   ├── dev.tfvars
│   ├── dev.backend.hcl
│   ├── staging.tfvars
│   ├── staging.backend.hcl
│   ├── prod.tfvars
│   └── prod.backend.hcl
├── main.tf
├── variables.tf
├── outputs.tf
├── providers.tf
└── versions.tf
```

### Root Module (main.tf)

```hcl
data "azurerm_client_config" "current" {}

locals {
  name_prefix = "${var.project}-${var.environment}"
  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      CostCenter  = var.cost_center
    },
    var.tags,
  )
}

resource "azurerm_resource_group" "main" {
  name     = "rg-${local.name_prefix}"
  location = var.location
  tags     = local.common_tags
}

module "networking" {
  source = "./modules/networking"

  name_prefix         = local.name_prefix
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  address_space       = var.vnet_address_space
  subnet_prefixes     = var.subnet_prefixes
  tags                = local.common_tags
}

module "security" {
  source = "./modules/security"

  name_prefix         = local.name_prefix
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  deployer_object_id  = data.azurerm_client_config.current.object_id
  allowed_ip_ranges   = var.allowed_ip_ranges
  tags                = local.common_tags
}

module "application" {
  source = "./modules/application"

  name_prefix         = local.name_prefix
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  app_subnet_id       = module.networking.app_subnet_id
  key_vault_id        = module.security.key_vault_id
  identity_id         = module.security.identity_id
  identity_client_id  = module.security.identity_client_id
  sku_name            = var.app_service_sku
  tags                = local.common_tags
}

module "data" {
  source = "./modules/data"

  name_prefix            = local.name_prefix
  resource_group_name    = azurerm_resource_group.main.name
  location               = var.location
  data_subnet_id         = module.networking.data_subnet_id
  pe_subnet_id           = module.networking.pe_subnet_id
  private_dns_zone_id    = module.networking.sql_private_dns_zone_id
  key_vault_id           = module.security.key_vault_id
  deployer_object_id     = data.azurerm_client_config.current.object_id
  sql_sku                = var.sql_sku
  tags                   = local.common_tags
}
```

### Environment-Specific tfvars

**env/dev.tfvars**:
```hcl
project     = "myapp"
environment = "dev"
location    = "australiaeast"
cost_center = "engineering"

vnet_address_space = ["10.1.0.0/16"]
subnet_prefixes = {
  app  = "10.1.1.0/24"
  data = "10.1.2.0/24"
  pe   = "10.1.3.0/24"
}

app_service_sku   = "B1"
sql_sku           = "S0"
allowed_ip_ranges = ["203.0.113.0/24"]

tags = {
  Team = "backend"
}
```

**env/prod.tfvars**:
```hcl
project     = "myapp"
environment = "prod"
location    = "australiaeast"
cost_center = "operations"

vnet_address_space = ["10.10.0.0/16"]
subnet_prefixes = {
  app  = "10.10.1.0/24"
  data = "10.10.2.0/24"
  pe   = "10.10.3.0/24"
}

app_service_sku   = "P1v3"
sql_sku           = "S3"
allowed_ip_ranges = ["203.0.113.0/24"]

tags = {
  Team       = "platform"
  Compliance = "required"
}
```

### Backend Configuration per Environment

**env/dev.backend.hcl**:
```hcl
resource_group_name  = "tfstate-rg"
storage_account_name = "tfstatemyapp"
container_name       = "tfstate"
key                  = "dev.terraform.tfstate"
use_azuread_auth     = true
```

**env/prod.backend.hcl**:
```hcl
resource_group_name  = "tfstate-rg"
storage_account_name = "tfstatemyapp"
container_name       = "tfstate"
key                  = "prod.terraform.tfstate"
use_azuread_auth     = true
```

**Usage**:
```bash
# Initialize with environment-specific backend
terraform init -backend-config="env/prod.backend.hcl"

# Plan with environment-specific variables
terraform plan -var-file="env/prod.tfvars" -out=prod.tfplan

# Apply
terraform apply prod.tfplan
```

### Workspace vs Directory Separation

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Directory per env** (recommended) | Clear isolation, separate state files, independent plans | Some code duplication | Production workloads, strict isolation |
| **Workspaces** | Less duplication, built-in | Shared backend config, risk of wrong workspace | Simple projects, dev/staging |
| **tfvars per env** (shown above) | Balance of isolation and DRY | Shared root module | Most projects |

---

## Networking Patterns

### Virtual Network with Subnets

```hcl
resource "azurerm_virtual_network" "main" {
  name                = "vnet-${var.name_prefix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  address_space       = var.address_space

  tags = var.tags
}

# Application subnet with App Service delegation
resource "azurerm_subnet" "app" {
  name                 = "snet-app"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.subnet_prefixes["app"]]

  delegation {
    name = "app-service-delegation"

    service_delegation {
      name = "Microsoft.Web/serverFarms"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/action",
      ]
    }
  }
}

# Data subnet with service endpoints
resource "azurerm_subnet" "data" {
  name                 = "snet-data"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.subnet_prefixes["data"]]

  service_endpoints = [
    "Microsoft.Sql",
    "Microsoft.Storage",
    "Microsoft.KeyVault",
  ]
}

# Private endpoint subnet
resource "azurerm_subnet" "pe" {
  name                 = "snet-private-endpoints"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.subnet_prefixes["pe"]]
}
```

### Network Security Groups

```hcl
resource "azurerm_network_security_group" "app" {
  name                = "nsg-snet-app"
  location            = var.location
  resource_group_name = var.resource_group_name

  # Allow inbound HTTPS
  security_rule {
    name                       = "AllowHTTPS"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  # Deny all other inbound
  security_rule {
    name                       = "DenyAllInbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = var.tags
}

resource "azurerm_subnet_network_security_group_association" "app" {
  subnet_id                 = azurerm_subnet.app.id
  network_security_group_id = azurerm_network_security_group.app.id
}

resource "azurerm_network_security_group" "data" {
  name                = "nsg-snet-data"
  location            = var.location
  resource_group_name = var.resource_group_name

  # Allow SQL from app subnet
  security_rule {
    name                       = "AllowSqlFromApp"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "1433"
    source_address_prefix      = var.subnet_prefixes["app"]
    destination_address_prefix = "*"
  }

  # Deny all other inbound
  security_rule {
    name                       = "DenyAllInbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = var.tags
}

resource "azurerm_subnet_network_security_group_association" "data" {
  subnet_id                 = azurerm_subnet.data.id
  network_security_group_id = azurerm_network_security_group.data.id
}
```

### Private Endpoints

```hcl
# Private DNS zone for SQL
resource "azurerm_private_dns_zone" "sql" {
  name                = "privatelink.database.windows.net"
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "sql" {
  name                  = "vnet-link-sql"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.sql.name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
}

# Private DNS zone for Key Vault
resource "azurerm_private_dns_zone" "kv" {
  name                = "privatelink.vaultcore.azure.net"
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "kv" {
  name                  = "vnet-link-kv"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.kv.name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
}

# Private DNS zone for Storage
resource "azurerm_private_dns_zone" "blob" {
  name                = "privatelink.blob.core.windows.net"
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "blob" {
  name                  = "vnet-link-blob"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.blob.name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
}
```

**Private DNS zone names for common services**:

| Service | Zone Name |
|---------|-----------|
| Azure SQL | `privatelink.database.windows.net` |
| Key Vault | `privatelink.vaultcore.azure.net` |
| Blob Storage | `privatelink.blob.core.windows.net` |
| Table Storage | `privatelink.table.core.windows.net` |
| Queue Storage | `privatelink.queue.core.windows.net` |
| File Storage | `privatelink.file.core.windows.net` |
| Service Bus | `privatelink.servicebus.windows.net` |
| App Configuration | `privatelink.azconfig.io` |
| Container Registry | `privatelink.azurecr.io` |

---

## App Service and Azure Functions Infrastructure

### App Service Plan

```hcl
resource "azurerm_service_plan" "main" {
  name                = "asp-${var.name_prefix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = var.sku_name  # "B1", "P1v3", "P2v3", etc.

  tags = var.tags
}
```

### Linux Web App

```hcl
resource "azurerm_linux_web_app" "api" {
  name                = "app-${var.name_prefix}-api"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.main.id

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity_id]
  }

  site_config {
    always_on                         = true
    health_check_path                 = "/health"
    health_check_eviction_time_in_min = 5

    application_stack {
      dotnet_version = "8.0"
    }

    ip_restriction_default_action = "Deny"

    ip_restriction {
      name       = "AllowFrontDoor"
      action     = "Allow"
      priority   = 100
      service_tag = "AzureFrontDoor.Backend"
      headers {
        x_azure_fdid = [var.front_door_id]
      }
    }
  }

  app_settings = {
    "AZURE_CLIENT_ID"                  = var.identity_client_id
    "KeyVaultUri"                      = var.key_vault_uri
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = azurerm_application_insights.main.connection_string
  }

  connection_string {
    name  = "DefaultConnection"
    type  = "SQLAzure"
    value = "Server=tcp:${var.sql_server_fqdn},1433;Database=${var.sql_database_name};Authentication=Active Directory Managed Identity;User Id=${var.identity_client_id};Encrypt=True;TrustServerCertificate=False;"
  }

  virtual_network_subnet_id = var.app_subnet_id

  logs {
    http_logs {
      file_system {
        retention_in_days = 7
        retention_in_mb   = 100
      }
    }
    application_logs {
      file_system_level = "Warning"
    }
  }

  tags = var.tags
}
```

### Deployment Slots

```hcl
resource "azurerm_linux_web_app_slot" "staging" {
  name           = "staging"
  app_service_id = azurerm_linux_web_app.api.id

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity_id]
  }

  site_config {
    always_on         = true
    health_check_path = "/health"

    application_stack {
      dotnet_version = "8.0"
    }
  }

  app_settings = azurerm_linux_web_app.api.app_settings

  virtual_network_subnet_id = var.app_subnet_id

  tags = var.tags
}
```

### Azure Functions (Consumption)

```hcl
resource "azurerm_storage_account" "func" {
  name                     = "stfunc${replace(var.name_prefix, "-", "")}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
  tags                     = var.tags
}

resource "azurerm_service_plan" "func" {
  name                = "asp-${var.name_prefix}-func"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = "Y1"  # Consumption plan

  tags = var.tags
}

resource "azurerm_linux_function_app" "main" {
  name                = "func-${var.name_prefix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.func.id

  storage_account_name       = azurerm_storage_account.func.name
  storage_account_access_key = azurerm_storage_account.func.primary_access_key

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity_id]
  }

  site_config {
    application_stack {
      dotnet_version              = "8.0"
      use_dotnet_isolated_runtime = true
    }

    application_insights_connection_string = azurerm_application_insights.main.connection_string
  }

  app_settings = {
    "AZURE_CLIENT_ID"         = var.identity_client_id
    "ServiceBusConnection__fullyQualifiedNamespace" = "${var.servicebus_namespace}.servicebus.windows.net"
  }

  tags = var.tags
}
```

### Application Insights

```hcl
resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${var.name_prefix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

resource "azurerm_application_insights" "main" {
  name                = "appi-${var.name_prefix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  tags                = var.tags
}
```

---

## Azure SQL with Private Endpoints

### SQL Server

```hcl
resource "azurerm_mssql_server" "main" {
  name                         = "sql-${var.name_prefix}"
  resource_group_name          = var.resource_group_name
  location                     = var.location
  version                      = "12.0"
  minimum_tls_version          = "1.2"
  public_network_access_enabled = false

  azuread_administrator {
    login_username = "sql-admins"
    object_id      = var.sql_admin_group_object_id
    azuread_authentication_only = true  # Disable SQL auth entirely
  }

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}
```

### SQL Database

```hcl
resource "azurerm_mssql_database" "main" {
  name      = "sqldb-${var.name_prefix}"
  server_id = azurerm_mssql_server.main.id

  sku_name                    = var.sql_sku  # "S0", "S3", "P1", "GP_S_Gen5_2"
  max_size_gb                 = 50
  zone_redundant              = var.environment == "prod" ? true : false
  read_scale                  = var.environment == "prod" ? true : false
  geo_backup_enabled          = true

  short_term_retention_policy {
    retention_days           = 7
    backup_interval_in_hours = 12
  }

  long_term_retention_policy {
    weekly_retention  = "P4W"
    monthly_retention = "P12M"
    yearly_retention  = "P5Y"
    week_of_year      = 1
  }

  threat_detection_policy {
    state                      = "Enabled"
    email_addresses            = var.security_contact_emails
    retention_days             = 30
    storage_endpoint           = azurerm_storage_account.audit.primary_blob_endpoint
    storage_account_access_key = azurerm_storage_account.audit.primary_access_key
  }

  tags = var.tags
}
```

### SQL Firewall Rules (when public access is needed)

```hcl
# Allow Azure services (when public access is enabled)
resource "azurerm_mssql_firewall_rule" "azure_services" {
  count    = var.enable_public_access ? 1 : 0
  name     = "AllowAzureServices"
  server_id = azurerm_mssql_server.main.id

  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Allow specific IPs
resource "azurerm_mssql_firewall_rule" "office" {
  for_each  = var.enable_public_access ? toset(var.allowed_ip_ranges) : toset([])
  name      = "Allow-${replace(each.value, "/", "-")}"
  server_id = azurerm_mssql_server.main.id

  start_ip_address = cidrhost(each.value, 0)
  end_ip_address   = cidrhost(each.value, pow(2, 32 - tonumber(split("/", each.value)[1])) - 1)
}

# VNet rule (when using service endpoints)
resource "azurerm_mssql_virtual_network_rule" "data" {
  count     = var.enable_public_access ? 1 : 0
  name      = "allow-data-subnet"
  server_id = azurerm_mssql_server.main.id
  subnet_id = var.data_subnet_id
}
```

### SQL Private Endpoint

```hcl
resource "azurerm_private_endpoint" "sql" {
  name                = "pe-sql-${var.name_prefix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.pe_subnet_id

  private_service_connection {
    name                           = "psc-sql-${var.name_prefix}"
    private_connection_resource_id = azurerm_mssql_server.main.id
    subresource_names              = ["sqlServer"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "pdz-sql"
    private_dns_zone_ids = [var.sql_private_dns_zone_id]
  }

  tags = var.tags
}
```

### SQL Auditing

```hcl
resource "azurerm_storage_account" "audit" {
  name                     = "staudit${replace(var.name_prefix, "-", "")}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  min_tls_version          = "TLS1_2"
  tags                     = var.tags
}

resource "azurerm_mssql_server_extended_auditing_policy" "main" {
  server_id                               = azurerm_mssql_server.main.id
  storage_endpoint                        = azurerm_storage_account.audit.primary_blob_endpoint
  storage_account_access_key              = azurerm_storage_account.audit.primary_access_key
  storage_account_access_key_is_secondary = false
  retention_in_days                       = 90
  log_monitoring_enabled                  = true
}

resource "azurerm_mssql_database_extended_auditing_policy" "main" {
  database_id                             = azurerm_mssql_database.main.id
  storage_endpoint                        = azurerm_storage_account.audit.primary_blob_endpoint
  storage_account_access_key              = azurerm_storage_account.audit.primary_access_key
  storage_account_access_key_is_secondary = false
  retention_in_days                       = 90
  log_monitoring_enabled                  = true
}
```

---

## Service Bus Infrastructure

### Namespace

```hcl
resource "azurerm_servicebus_namespace" "main" {
  name                = "sb-${var.name_prefix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = "Standard"  # "Basic", "Standard", "Premium"

  # Premium-only settings
  # capacity                     = 1
  # premium_messaging_partitions = 1
  # zone_redundant               = true

  minimum_tls_version = "1.2"
  public_network_access_enabled = true

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}
```

### Queues

```hcl
resource "azurerm_servicebus_queue" "orders" {
  name         = "orders"
  namespace_id = azurerm_servicebus_namespace.main.id

  max_delivery_count               = 10
  lock_duration                    = "PT1M"  # 1 minute
  max_size_in_megabytes            = 1024
  default_message_ttl              = "P14D"  # 14 days
  dead_lettering_on_message_expiration = true
  duplicate_detection_history_time_window = "PT10M"
  requires_duplicate_detection     = true
  requires_session                 = false
  enable_partitioning              = false  # Standard SKU
}

resource "azurerm_servicebus_queue" "orders_dlq" {
  name         = "orders-dlq"
  namespace_id = azurerm_servicebus_namespace.main.id

  max_delivery_count    = 1
  max_size_in_megabytes = 1024
  default_message_ttl   = "P30D"
}
```

### Topics and Subscriptions

```hcl
resource "azurerm_servicebus_topic" "events" {
  name         = "domain-events"
  namespace_id = azurerm_servicebus_namespace.main.id

  max_size_in_megabytes            = 5120
  default_message_ttl              = "P7D"
  requires_duplicate_detection     = true
  duplicate_detection_history_time_window = "PT10M"
  support_ordering                 = true
  enable_partitioning              = false
}

resource "azurerm_servicebus_subscription" "order_processor" {
  name               = "order-processor"
  topic_id           = azurerm_servicebus_topic.events.id
  max_delivery_count = 10
  lock_duration      = "PT1M"
  default_message_ttl = "P7D"
  dead_lettering_on_message_expiration = true
  dead_lettering_on_filter_evaluation_error = true
}

resource "azurerm_servicebus_subscription_rule" "order_events" {
  name            = "order-events-only"
  subscription_id = azurerm_servicebus_subscription.order_processor.id
  filter_type     = "CorrelationFilter"

  correlation_filter {
    label = "OrderEvent"
    properties = {
      "EventType" = "OrderCreated"
    }
  }
}

resource "azurerm_servicebus_subscription" "notification_handler" {
  name               = "notification-handler"
  topic_id           = azurerm_servicebus_topic.events.id
  max_delivery_count = 5
  lock_duration      = "PT30S"
}

resource "azurerm_servicebus_subscription_rule" "notification_events" {
  name            = "notification-events"
  subscription_id = azurerm_servicebus_subscription.notification_handler.id
  filter_type     = "SqlFilter"
  sql_filter      = "EventType IN ('OrderCreated', 'OrderShipped', 'OrderDelivered')"
}
```

### Authorization Rules (Shared Access Policies)

```hcl
# Namespace-level rule for management
resource "azurerm_servicebus_namespace_authorization_rule" "manage" {
  name         = "manage-policy"
  namespace_id = azurerm_servicebus_namespace.main.id

  listen = true
  send   = true
  manage = true
}

# Queue-level rule for the application (least privilege)
resource "azurerm_servicebus_queue_authorization_rule" "orders_sender" {
  name     = "sender-policy"
  queue_id = azurerm_servicebus_queue.orders.id

  listen = false
  send   = true
  manage = false
}

resource "azurerm_servicebus_queue_authorization_rule" "orders_listener" {
  name     = "listener-policy"
  queue_id = azurerm_servicebus_queue.orders.id

  listen = true
  send   = false
  manage = false
}
```

### Service Bus RBAC (preferred over SAS keys)

```hcl
# Grant send permission to the app identity
resource "azurerm_role_assignment" "sb_sender" {
  scope                = azurerm_servicebus_namespace.main.id
  role_definition_name = "Azure Service Bus Data Sender"
  principal_id         = var.app_identity_principal_id
}

# Grant receive permission to the function app identity
resource "azurerm_role_assignment" "sb_receiver" {
  scope                = azurerm_servicebus_namespace.main.id
  role_definition_name = "Azure Service Bus Data Receiver"
  principal_id         = var.func_identity_principal_id
}

# Full owner for admin
resource "azurerm_role_assignment" "sb_owner" {
  scope                = azurerm_servicebus_namespace.main.id
  role_definition_name = "Azure Service Bus Data Owner"
  principal_id         = var.admin_group_object_id
}
```

### Service Bus Private Endpoint

```hcl
resource "azurerm_private_dns_zone" "servicebus" {
  name                = "privatelink.servicebus.windows.net"
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "servicebus" {
  name                  = "vnet-link-servicebus"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.servicebus.name
  virtual_network_id    = var.vnet_id
  registration_enabled  = false
}

resource "azurerm_private_endpoint" "servicebus" {
  name                = "pe-sb-${var.name_prefix}"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.pe_subnet_id

  private_service_connection {
    name                           = "psc-sb-${var.name_prefix}"
    private_connection_resource_id = azurerm_servicebus_namespace.main.id
    subresource_names              = ["namespace"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "pdz-servicebus"
    private_dns_zone_ids = [azurerm_private_dns_zone.servicebus.id]
  }

  tags = var.tags
}
```

---

## State Management Best Practices

### State Locking

Azure Storage backend uses blob leases for state locking. No additional configuration is needed; locking is automatic when using the `azurerm` backend.

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "tfstate-rg"
    storage_account_name = "tfstatemyapp"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
    use_azuread_auth     = true
  }
}
```

If a lock becomes stuck (e.g., from a crashed process):
```bash
# Force unlock (use with caution)
terraform force-unlock <LOCK_ID>
```

### State Import

```bash
# Import an existing resource into state
terraform import azurerm_resource_group.main \
  /subscriptions/xxx/resourceGroups/rg-myapp-prod

# Import a Key Vault
terraform import azurerm_key_vault.main \
  /subscriptions/xxx/resourceGroups/rg-myapp-prod/providers/Microsoft.KeyVault/vaults/kv-myapp-prod

# Import a SQL Server
terraform import azurerm_mssql_server.main \
  /subscriptions/xxx/resourceGroups/rg-myapp-prod/providers/Microsoft.Sql/servers/sql-myapp-prod

# Import a SQL Database
terraform import azurerm_mssql_database.main \
  /subscriptions/xxx/resourceGroups/rg-myapp-prod/providers/Microsoft.Sql/servers/sql-myapp-prod/databases/sqldb-myapp-prod
```

### State Move

```bash
# Rename a resource in state (after refactoring)
terraform state mv azurerm_resource_group.main azurerm_resource_group.primary

# Move a resource to a module
terraform state mv azurerm_key_vault.main module.security.azurerm_key_vault.main

# Move between modules
terraform state mv module.old.azurerm_storage_account.data module.new.azurerm_storage_account.data
```

### Workspace vs Directory Separation

**Directory separation** (recommended for production):
```
infrastructure/
├── shared/          # Shared resources (VNet, DNS, etc.)
│   ├── main.tf
│   └── env/
│       ├── prod.tfvars
│       └── prod.backend.hcl
├── application/     # App Service, Functions
│   ├── main.tf
│   └── env/
│       ├── prod.tfvars
│       └── prod.backend.hcl
└── data/            # SQL, Storage, Service Bus
    ├── main.tf
    └── env/
        ├── prod.tfvars
        └── prod.backend.hcl
```

Benefits:
- Blast radius control: changing app infra cannot destroy networking
- Independent plan/apply cycles
- Different team permissions per directory
- Faster plan execution (smaller state files)

**Cross-stack references using data sources**:
```hcl
# In application/ stack, reference networking outputs
data "terraform_remote_state" "networking" {
  backend = "azurerm"

  config = {
    resource_group_name  = "tfstate-rg"
    storage_account_name = "tfstatemyapp"
    container_name       = "tfstate"
    key                  = "shared.terraform.tfstate"
    use_azuread_auth     = true
  }
}

# Use the outputs
resource "azurerm_linux_web_app" "api" {
  # ...
  virtual_network_subnet_id = data.terraform_remote_state.networking.outputs.app_subnet_id
}
```

### Sensitive State Values

```hcl
# Mark variables as sensitive to prevent them appearing in logs
variable "sql_admin_password" {
  description = "SQL administrator password"
  type        = string
  sensitive   = true
}

# Mark outputs as sensitive
output "sql_connection_string" {
  description = "SQL connection string"
  value       = "Server=tcp:${azurerm_mssql_server.main.fully_qualified_domain_name},1433;..."
  sensitive   = true
}
```

**State file encryption**: The azurerm backend stores state in Azure Blob Storage. Ensure the storage account has:
- `min_tls_version = "TLS1_2"`
- Server-side encryption (enabled by default)
- Network rules restricting access
- RBAC-based access (via `use_azuread_auth = true`)

### Preventing Accidental Destruction

```hcl
# Prevent deletion of critical resources
resource "azurerm_mssql_server" "main" {
  # ...

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_key_vault" "main" {
  # ...

  lifecycle {
    prevent_destroy = true
  }
}

# Ignore changes managed outside Terraform
resource "azurerm_mssql_database" "main" {
  # ...

  lifecycle {
    ignore_changes = [
      tags["LastModified"],
    ]
  }
}
```

---

## Additional Resources

**Microsoft Documentation**:
- [Azure Verified Modules Registry](https://registry.terraform.io/namespaces/Azure)
- [azurerm Provider 4.x Upgrade Guide](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/guides/4.0-upgrade-guide)
- [Azure Naming Conventions](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming)
- [Azure Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/)

**Terraform Documentation**:
- [azurerm Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [Backend Configuration](https://developer.hashicorp.com/terraform/language/backend/azurerm)

---

**Terraform Compatibility**: >= 1.8.0 | **azurerm Provider**: ~> 4.0 | **Last Updated**: 2026-02-23 | **Version**: 1.0.0
