# Azure Functions Comprehensive Reference

This document provides in-depth coverage of Azure Functions isolated worker patterns,
migration guidance, advanced Durable Functions, managed identity, and deployment strategies.

---

## Table of Contents

1. [Migration from In-Process to Isolated Worker](#1-migration-from-in-process-to-isolated-worker)
2. [Advanced Durable Functions](#2-advanced-durable-functions)
3. [Service Bus Session-Enabled Processing](#3-service-bus-session-enabled-processing)
4. [Managed Identity Bindings](#4-managed-identity-bindings)
5. [Local Development](#5-local-development)
6. [Deployment](#6-deployment)

---

## 1. Migration from In-Process to Isolated Worker

### Migration Checklist

1. Update target framework to .NET 8 or .NET 9
2. Replace NuGet packages (see table below)
3. Add `Program.cs` with `HostBuilder`
4. Update function signatures (namespace changes)
5. Replace `FunctionName` attribute with `Function`
6. Update HTTP trigger types
7. Update Service Bus message types
8. Migrate middleware / function filters
9. Update `host.json` and `local.settings.json`
10. Test locally, then deploy

### NuGet Package Mapping

| In-Process Package | Isolated Worker Package |
|--------------------|------------------------|
| `Microsoft.NET.Sdk.Functions` | `Microsoft.Azure.Functions.Worker.Sdk` |
| `Microsoft.Azure.WebJobs` | `Microsoft.Azure.Functions.Worker` |
| `Microsoft.Azure.WebJobs.Extensions` | `Microsoft.Azure.Functions.Worker.Extensions.*` |
| `Microsoft.Azure.WebJobs.Extensions.Http` | `Microsoft.Azure.Functions.Worker.Extensions.Http.AspNetCore` |
| `Microsoft.Azure.WebJobs.Extensions.ServiceBus` | `Microsoft.Azure.Functions.Worker.Extensions.ServiceBus` |
| `Microsoft.Azure.WebJobs.Extensions.DurableTask` | `Microsoft.Azure.Functions.Worker.Extensions.DurableTask` |
| `Microsoft.Azure.WebJobs.Extensions.Storage` | `Microsoft.Azure.Functions.Worker.Extensions.Storage.*` |

### .csproj Changes

**Before (in-process)**:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <AzureFunctionsVersion>v4</AzureFunctionsVersion>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Sdk.Functions" Version="4.*" />
  </ItemGroup>
</Project>
```

**After (isolated worker)**:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <AzureFunctionsVersion>v4</AzureFunctionsVersion>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="2.*" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="2.*" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Http.AspNetCore" Version="2.*" />
    <PackageReference Include="Microsoft.ApplicationInsights.WorkerService" Version="2.*" />
  </ItemGroup>
</Project>
```

### Namespace Changes

| In-Process Namespace | Isolated Worker Namespace |
|---------------------|--------------------------|
| `Microsoft.Azure.WebJobs` | `Microsoft.Azure.Functions.Worker` |
| `Microsoft.Azure.WebJobs.Host` | `Microsoft.Azure.Functions.Worker` |
| `Microsoft.Azure.WebJobs.Extensions.Http` | `Microsoft.Azure.Functions.Worker.Http` |
| `Microsoft.Azure.WebJobs.Extensions.DurableTask` | `Microsoft.DurableTask` |
| `Microsoft.Azure.ServiceBus` | `Azure.Messaging.ServiceBus` |

### Function Signature Changes

**Before (in-process)**:
```csharp
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;

public static class ProductFunctions
{
    [FunctionName("GetProduct")]
    public static async Task<IActionResult> GetProduct(
        [HttpTrigger(AuthorizationLevel.Function, "get", Route = "products/{id}")]
        HttpRequest req,
        string id,
        ILogger log)
    {
        log.LogInformation("Getting product {Id}", id);
        return new OkObjectResult(new { id });
    }

    [FunctionName("ProcessOrder")]
    public static async Task ProcessOrder(
        [ServiceBusTrigger("orders", Connection = "ServiceBusConnection")]
        Message message,
        ILogger log)
    {
        var body = Encoding.UTF8.GetString(message.Body);
    }
}
```

**After (isolated worker)**:
```csharp
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Azure.Messaging.ServiceBus;

public class ProductFunctions
{
    private readonly ILogger<ProductFunctions> _logger;

    public ProductFunctions(ILogger<ProductFunctions> logger)
    {
        _logger = logger;
    }

    [Function("GetProduct")]
    public async Task<IActionResult> GetProduct(
        [HttpTrigger(AuthorizationLevel.Function, "get", Route = "products/{id}")]
        HttpRequest req,
        string id)
    {
        _logger.LogInformation("Getting product {Id}", id);
        return new OkObjectResult(new { id });
    }

    [Function("ProcessOrder")]
    public async Task ProcessOrder(
        [ServiceBusTrigger("orders", Connection = "ServiceBusConnection")]
        ServiceBusReceivedMessage message,
        ServiceBusMessageActions messageActions)
    {
        var order = message.Body.ToObjectFromJson<OrderMessage>();
        await messageActions.CompleteMessageAsync(message);
    }
}
```

### Key Migration Differences

| Aspect | In-Process | Isolated Worker |
|--------|-----------|-----------------|
| Class style | `static` methods | Instance methods with constructor DI |
| Attribute | `[FunctionName("...")]` | `[Function("...")]` |
| Logger | `ILogger` parameter | Constructor-injected `ILogger<T>` |
| Service Bus message | `Message` | `ServiceBusReceivedMessage` |
| Message settlement | Automatic | Explicit via `ServiceBusMessageActions` |
| Startup | `IWebJobsStartup` | `Program.cs` with `HostBuilder` |
| Filters | `IFunctionInvocationFilter` | `IFunctionsWorkerMiddleware` |

---

## 2. Advanced Durable Functions

### Eternal Orchestrations

Eternal orchestrations run indefinitely with periodic work cycles.
Use `ContinueAsNew` to reset history and prevent unbounded growth.

```csharp
[Function(nameof(EternalMonitorOrchestrator))]
public static async Task EternalMonitorOrchestrator(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var config = context.GetInput<MonitorConfig>()!;

    var status = await context.CallActivityAsync<SystemStatus>(
        nameof(CheckSystemHealthActivity), config.SystemId);

    if (status.IsUnhealthy)
    {
        await context.CallActivityAsync(nameof(SendAlertActivity),
            new Alert { SystemId = config.SystemId, Status = status });
    }

    // Wait before next check - use context.CreateTimer, NOT Task.Delay
    var nextCheck = context.CurrentUtcDateTime.AddMinutes(5);
    await context.CreateTimer(nextCheck, CancellationToken.None);

    // Restart with fresh history
    context.ContinueAsNew(config);
}
```

### Human Interaction Pattern (Approval Workflow)

```csharp
[Function(nameof(ApprovalOrchestrator))]
public static async Task<string> ApprovalOrchestrator(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var request = context.GetInput<ApprovalRequest>()!;

    await context.CallActivityAsync(nameof(SendApprovalEmailActivity), request);

    // Wait for external event with timeout
    using var cts = new CancellationTokenSource();
    var expiration = context.CurrentUtcDateTime.AddHours(72);
    var timeoutTask = context.CreateTimer(expiration, cts.Token);
    var approvalTask = context.WaitForExternalEvent<ApprovalResponse>("ApprovalResponse");

    var winner = await Task.WhenAny(approvalTask, timeoutTask);

    if (winner == approvalTask)
    {
        cts.Cancel();
        var response = approvalTask.Result;
        await context.CallActivityAsync(nameof(ProcessApprovalActivity),
            new { request, response });
        return response.Approved ? "approved" : "rejected";
    }

    await context.CallActivityAsync(nameof(EscalateApprovalActivity), request);
    return "escalated";
}

// Raise the external event from an HTTP function
[Function("SubmitApproval")]
public async Task<IActionResult> SubmitApproval(
    [HttpTrigger(AuthorizationLevel.Function, "post", Route = "approvals/{instanceId}")]
    HttpRequest req,
    [FromBody] ApprovalResponse response,
    string instanceId,
    [DurableClient] DurableTaskClient client)
{
    await client.RaiseEventAsync(instanceId, "ApprovalResponse", response);
    return new AcceptedResult();
}
```

### Sub-Orchestrations

```csharp
[Function(nameof(ParentOrchestrator))]
public static async Task<OrderResult> ParentOrchestrator(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var order = context.GetInput<OrderRequest>()!;

    var paymentTask = context.CallSubOrchestratorAsync<PaymentResult>(
        nameof(PaymentOrchestrator), order.PaymentDetails);
    var shippingTask = context.CallSubOrchestratorAsync<ShippingResult>(
        nameof(ShippingOrchestrator), order.ShippingDetails);

    await Task.WhenAll(paymentTask, shippingTask);

    return new OrderResult
    {
        Payment = paymentTask.Result,
        Shipping = shippingTask.Result
    };
}
```

### Durable Entities (Entity Functions)

Durable entities maintain state and process operations serially.

```csharp
public class CounterEntity : TaskEntity<int>
{
    public int Add(int amount) { State += amount; return State; }
    public int Get() => State;
    public void Reset() => State = 0;

    [Function(nameof(CounterEntity))]
    public static Task RunEntityDispatcher(
        [EntityTrigger] TaskEntityDispatcher dispatcher)
        => dispatcher.DispatchAsync<CounterEntity>();
}

// Using entities from an orchestrator
[Function(nameof(EntityOrchestrator))]
public static async Task EntityOrchestrator(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var entityId = new EntityInstanceId(nameof(CounterEntity), "myCounter");
    await context.Entities.SignalEntityAsync(entityId, "Add", 5);
    var value = await context.Entities.CallEntityAsync<int>(entityId, "Get");
}
```

### Orchestrator Status Querying

```csharp
[Function("GetWorkflowStatus")]
public async Task<IActionResult> GetWorkflowStatus(
    [HttpTrigger(AuthorizationLevel.Function, "get", Route = "workflows/{instanceId}/status")]
    HttpRequest req,
    string instanceId,
    [DurableClient] DurableTaskClient client)
{
    var metadata = await client.GetInstanceAsync(instanceId);
    if (metadata is null) return new NotFoundResult();

    return new OkObjectResult(new
    {
        instanceId = metadata.InstanceId,
        runtimeStatus = metadata.RuntimeStatus.ToString(),
        createdAt = metadata.CreatedAt,
        lastUpdatedAt = metadata.LastUpdatedAt
    });
}
```

---

## 3. Service Bus Session-Enabled Processing

Sessions enable FIFO message processing and session affinity, ensuring messages
with the same session ID are processed sequentially by one consumer.

### Session-Enabled Trigger

```csharp
[Function("ProcessSessionMessages")]
public async Task ProcessSessionMessages(
    [ServiceBusTrigger("session-queue", Connection = "ServiceBusConnection",
        IsSessionsEnabled = true)]
    ServiceBusReceivedMessage message,
    ServiceBusMessageActions messageActions,
    ServiceBusSessionMessageActions sessionActions)
{
    _logger.LogInformation("Session {SessionId}, message {MessageId}",
        message.SessionId, message.MessageId);

    // Access persisted session state
    var sessionState = await sessionActions.GetSessionStateAsync();
    var state = sessionState?.ToObjectFromJson<SessionState>() ?? new SessionState();

    state.ProcessedCount++;
    state.LastProcessedAt = DateTime.UtcNow;

    await sessionActions.SetSessionStateAsync(BinaryData.FromObjectAsJson(state));
    await messageActions.CompleteMessageAsync(message);
}
```

### host.json Session Configuration

```json
{
  "extensions": {
    "serviceBus": {
      "maxConcurrentSessions": 8,
      "sessionIdleTimeout": "00:05:00",
      "autoCompleteMessages": false
    }
  }
}
```

### FIFO Guarantee Rules

| Guarantee | Scope | Notes |
|-----------|-------|-------|
| Ordering | Within a session | Same `SessionId` processed in order |
| Exclusivity | Per session | One consumer per session at a time |
| Cross-session | No ordering | Different sessions may process in parallel |

---

## 4. Managed Identity Bindings

Managed identity eliminates connection string secrets. Use the
`__fullyQualifiedNamespace` pattern in configuration.

### Configuration Pattern

Replace connection strings with identity-based connections:

```json
{
  "Values": {
    "ServiceBusConnection__fullyQualifiedNamespace": "myservicebus.servicebus.windows.net",
    "StorageConnection__blobServiceUri": "https://mystorage.blob.core.windows.net",
    "StorageConnection__queueServiceUri": "https://mystorage.queue.core.windows.net"
  }
}
```

Function code does not change -- only configuration. The runtime resolves the
identity-based connection automatically.

### Required Role Assignments

| Resource | Built-in Role |
|----------|--------------|
| Service Bus (receive) | Azure Service Bus Data Receiver |
| Service Bus (send) | Azure Service Bus Data Sender |
| Blob Storage | Storage Blob Data Contributor |
| Queue Storage | Storage Queue Data Contributor |
| Table Storage | Storage Table Data Contributor |

### Azure CLI Role Assignment

```bash
az role assignment create \
  --assignee <function-app-principal-id> \
  --role "Azure Service Bus Data Receiver" \
  --scope /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ServiceBus/namespaces/<ns>
```

### Durable Functions with Managed Identity Storage

```json
{
  "extensions": {
    "durableTask": {
      "storageProvider": {
        "type": "AzureStorage",
        "connectionName": "DurableStorage"
      }
    }
  }
}
```

Application settings:
```
DurableStorage__blobServiceUri=https://mystorage.blob.core.windows.net
DurableStorage__queueServiceUri=https://mystorage.queue.core.windows.net
DurableStorage__tableServiceUri=https://mystorage.table.core.windows.net
```

---

## 5. Local Development

### Prerequisites

- .NET 8 SDK or .NET 9 SDK
- Azure Functions Core Tools v4 (`npm install -g azure-functions-core-tools@4`)
- Azurite storage emulator (for Durable Functions, Blob/Queue/Table triggers)
- Service Bus emulator or real namespace (for Service Bus triggers)

### Azurite Setup

```bash
# Install and start
npm install -g azurite
azurite --silent --location ./azurite-data

# Or Docker
docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 \
  mcr.microsoft.com/azure-storage/azurite
```

### Service Bus Emulator Setup

```yaml
# docker-compose.servicebus.yml
services:
  servicebus-emulator:
    image: mcr.microsoft.com/azure-messaging/servicebus-emulator:latest
    ports:
      - "5672:5672"
    volumes:
      - ./servicebus-config.json:/ServiceBus_Emulator/ConfigFiles/Config.json
    environment:
      ACCEPT_EULA: "Y"
      SQL_SERVER: sqledge
    depends_on:
      - sqledge

  sqledge:
    image: mcr.microsoft.com/azure-sql-edge:latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "YourStrong!Passw0rd"
    ports:
      - "1433:1433"
```

```json
// servicebus-config.json
{
  "UserConfig": {
    "Namespaces": [
      {
        "Name": "local-servicebus",
        "Queues": [
          { "Name": "orders", "Properties": {} }
        ],
        "Topics": [
          {
            "Name": "events",
            "Subscriptions": [
              { "Name": "email-handler", "Properties": {} }
            ]
          }
        ]
      }
    ]
  }
}
```

### local.settings.json

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "ServiceBusConnection": "Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;"
  }
}
```

**IMPORTANT**: `local.settings.json` must be in `.gitignore`. Never commit it.

### Running Locally

```bash
dotnet build
func start
func start --port 7072          # Custom port
func start --verbose            # Verbose logging
```

---

## 6. Deployment

### Azure DevOps Pipeline

```yaml
trigger:
  branches:
    include: [main]

pool:
  vmImage: 'ubuntu-latest'

stages:
  - stage: Build
    jobs:
      - job: BuildAndTest
        steps:
          - task: UseDotNet@2
            inputs:
              version: '8.0.x'
          - script: dotnet restore src/MyFunctionApp
          - script: dotnet build src/MyFunctionApp --configuration Release --no-restore
          - script: dotnet test src/MyFunctionApp.Tests --configuration Release --no-build
          - script: dotnet publish src/MyFunctionApp --configuration Release --output $(Build.ArtifactStagingDirectory)/publish
          - publish: $(Build.ArtifactStagingDirectory)/publish
            artifact: functionapp

  - stage: Deploy
    dependsOn: Build
    jobs:
      - deployment: DeployFunction
        environment: 'production'
        strategy:
          runOnce:
            deploy:
              steps:
                - task: AzureFunctionApp@2
                  inputs:
                    connectedServiceNameARM: 'AzureServiceConnection'
                    appType: 'functionApp'
                    appName: '$(functionAppName)'
                    package: '$(Pipeline.Workspace)/functionapp/**'
                    deploymentMethod: 'zipDeploy'
```

### GitHub Actions

```yaml
name: Deploy Azure Functions
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - run: dotnet restore src/MyFunctionApp
      - run: dotnet build src/MyFunctionApp --configuration Release --no-restore
      - run: dotnet test src/MyFunctionApp.Tests --configuration Release --no-build
      - run: dotnet publish src/MyFunctionApp --configuration Release --output ./output
      - uses: Azure/functions-action@v1
        with:
          app-name: ${{ env.AZURE_FUNCTIONAPP_NAME }}
          package: ./output
          publish-profile: ${{ secrets.AZURE_FUNCTIONAPP_PUBLISH_PROFILE }}
```

### Azure CLI Deployment

```bash
dotnet publish src/MyFunctionApp --configuration Release --output ./publish
cd publish && zip -r ../deploy.zip . && cd ..
az functionapp deployment source config-zip \
  --resource-group my-resource-group \
  --name my-function-app \
  --src deploy.zip

# Or use func CLI
func azure functionapp publish my-function-app
```

### Deployment Slots (Zero-Downtime)

```bash
# Create staging slot
az functionapp deployment slot create \
  --name my-function-app --resource-group my-rg --slot staging

# Deploy to staging
func azure functionapp publish my-function-app --slot staging

# Swap to production
az functionapp deployment slot swap \
  --name my-function-app --resource-group my-rg --slot staging --target-slot production
```

### Infrastructure as Code (Bicep)

```bicep
@description('Name of the function app')
param functionAppName string
param location string = resourceGroup().location

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: '${replace(functionAppName, '-', '')}storage'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${functionAppName}-plan'
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }
  properties: { reserved: true }
}

resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      netFrameworkVersion: 'v8.0'
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storageAccount.name }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'dotnet-isolated' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
      ]
    }
  }
}

output functionAppPrincipalId string = functionApp.identity.principalId
```

---

**Skill Version**: 1.0.0
