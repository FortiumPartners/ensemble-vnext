# Azure DevOps Pipelines Comprehensive Reference

**Version**: 1.0.0 | **Purpose**: Complete guide for Azure DevOps YAML pipelines, templates, service connections, and advanced patterns

---

## Table of Contents

1. [Template Library Patterns](#template-library-patterns)
2. [Service Connections and Managed Identity](#service-connections-and-managed-identity)
3. [Container Jobs and Self-Hosted Agents](#container-jobs-and-self-hosted-agents)
4. [Pipeline Caching](#pipeline-caching)
5. [Release Pipelines vs YAML Pipelines](#release-pipelines-vs-yaml-pipelines)
6. [Azure CLI and Script Tasks](#azure-cli-and-script-tasks)
7. [Docker Build and Push](#docker-build-and-push)
8. [Terraform Integration](#terraform-integration)
9. [Advanced Variable Patterns](#advanced-variable-patterns)
10. [Security and Compliance](#security-and-compliance)
11. [Troubleshooting](#troubleshooting)

---

## Template Library Patterns

### Reusable Stage Template

Create a shared template repository that multiple pipelines reference.

**File: `templates/stages/deploy-webapp.yml`**
```yaml
parameters:
  - name: environment
    type: string
  - name: serviceConnection
    type: string
  - name: appName
    type: string
  - name: resourceGroup
    type: string
    default: ''
  - name: slot
    type: string
    default: 'production'
  - name: dependsOn
    type: object
    default: []
  - name: condition
    type: string
    default: 'succeeded()'
  - name: preDeploySteps
    type: stepList
    default: []
  - name: postDeploySteps
    type: stepList
    default: []

stages:
  - stage: Deploy_${{ replace(parameters.environment, '-', '_') }}
    displayName: 'Deploy to ${{ parameters.environment }}'
    dependsOn: ${{ parameters.dependsOn }}
    condition: ${{ parameters.condition }}
    jobs:
      - deployment: Deploy
        displayName: 'Deploy ${{ parameters.appName }}'
        environment: '${{ parameters.environment }}'
        strategy:
          runOnce:
            deploy:
              steps:
                - ${{ each step in parameters.preDeploySteps }}:
                  - ${{ step }}

                - task: DownloadPipelineArtifact@2
                  inputs:
                    artifactName: 'drop'
                    targetPath: '$(Pipeline.Workspace)/drop'

                - task: AzureWebApp@1
                  displayName: 'Deploy to Azure Web App'
                  inputs:
                    azureSubscription: '${{ parameters.serviceConnection }}'
                    appType: 'webApp'
                    appName: '${{ parameters.appName }}'
                    resourceGroupName: '${{ parameters.resourceGroup }}'
                    package: '$(Pipeline.Workspace)/drop/**/*.zip'
                    deployToSlotOrASE: ${{ ne(parameters.slot, 'production') }}
                    slotName: '${{ parameters.slot }}'

                - ${{ each step in parameters.postDeploySteps }}:
                  - ${{ step }}
```

**Usage in consuming pipeline:**
```yaml
resources:
  repositories:
    - repository: templates
      type: git
      name: MyProject/pipeline-templates
      ref: refs/heads/main

stages:
  - stage: Build
    jobs:
      - job: Build
        steps:
          - script: dotnet publish -o $(Build.ArtifactStagingDirectory)
          - task: PublishPipelineArtifact@1
            inputs:
              targetPath: '$(Build.ArtifactStagingDirectory)'
              artifact: 'drop'

  - template: templates/stages/deploy-webapp.yml@templates
    parameters:
      environment: 'staging'
      serviceConnection: 'Azure-Staging'
      appName: 'myapp-staging'
      resourceGroup: 'rg-myapp-staging'
      dependsOn: ['Build']

  - template: templates/stages/deploy-webapp.yml@templates
    parameters:
      environment: 'production'
      serviceConnection: 'Azure-Production'
      appName: 'myapp-prod'
      resourceGroup: 'rg-myapp-prod'
      dependsOn: ['Deploy_staging']
      postDeploySteps:
        - script: |
            curl -f https://myapp-prod.azurewebsites.net/health
          displayName: 'Smoke test'
```

### Reusable Job Template

**File: `templates/jobs/dotnet-build.yml`**
```yaml
parameters:
  - name: dotnetVersion
    type: string
    default: '8.x'
  - name: buildConfiguration
    type: string
    default: 'Release'
  - name: projects
    type: string
    default: '**/*.csproj'
  - name: testProjects
    type: string
    default: '**/*Tests.csproj'
  - name: publishProject
    type: string
    default: ''
  - name: runTests
    type: boolean
    default: true
  - name: publishArtifact
    type: boolean
    default: true
  - name: artifactName
    type: string
    default: 'drop'
  - name: pool
    type: object
    default:
      vmImage: 'ubuntu-latest'

jobs:
  - job: Build
    displayName: 'Build .NET Application'
    pool: ${{ parameters.pool }}
    steps:
      - task: UseDotNet@2
        displayName: 'Install .NET SDK ${{ parameters.dotnetVersion }}'
        inputs:
          packageType: 'sdk'
          version: '${{ parameters.dotnetVersion }}'

      - task: DotNetCoreCLI@2
        displayName: 'Restore'
        inputs:
          command: 'restore'
          projects: '${{ parameters.projects }}'

      - task: DotNetCoreCLI@2
        displayName: 'Build'
        inputs:
          command: 'build'
          projects: '${{ parameters.projects }}'
          arguments: '--configuration ${{ parameters.buildConfiguration }} --no-restore'

      - ${{ if parameters.runTests }}:
        - task: DotNetCoreCLI@2
          displayName: 'Test'
          inputs:
            command: 'test'
            projects: '${{ parameters.testProjects }}'
            arguments: >-
              --configuration ${{ parameters.buildConfiguration }}
              --no-build
              --collect:"XPlat Code Coverage"
              --logger trx
              --results-directory $(Agent.TempDirectory)

        - task: PublishTestResults@2
          displayName: 'Publish Test Results'
          inputs:
            testResultsFormat: 'VSTest'
            testResultsFiles: '$(Agent.TempDirectory)/**/*.trx'
          condition: always()

        - task: PublishCodeCoverageResults@2
          displayName: 'Publish Code Coverage'
          inputs:
            summaryFileLocation: '$(Agent.TempDirectory)/**/coverage.cobertura.xml'
          condition: always()

      - ${{ if parameters.publishArtifact }}:
        - task: DotNetCoreCLI@2
          displayName: 'Publish'
          inputs:
            command: 'publish'
            ${{ if parameters.publishProject }}:
              projects: '${{ parameters.publishProject }}'
            ${{ else }}:
              publishWebProjects: true
            arguments: >-
              --configuration ${{ parameters.buildConfiguration }}
              --no-build
              --output $(Build.ArtifactStagingDirectory)
            zipAfterPublish: true

        - task: PublishPipelineArtifact@1
          displayName: 'Publish Artifact'
          inputs:
            targetPath: '$(Build.ArtifactStagingDirectory)'
            artifact: '${{ parameters.artifactName }}'
```

### Reusable Step Template

**File: `templates/steps/run-integration-tests.yml`**
```yaml
parameters:
  - name: baseUrl
    type: string
  - name: testProject
    type: string
    default: '**/*IntegrationTests.csproj'
  - name: continueOnError
    type: boolean
    default: false

steps:
  - task: DotNetCoreCLI@2
    displayName: 'Run Integration Tests'
    inputs:
      command: 'test'
      projects: '${{ parameters.testProject }}'
      arguments: '--configuration Release'
    env:
      BASE_URL: '${{ parameters.baseUrl }}'
    continueOnError: ${{ parameters.continueOnError }}
```

### Variable Template

**File: `templates/variables/common.yml`**
```yaml
variables:
  - name: buildConfiguration
    value: 'Release'
  - name: dotnetVersion
    value: '8.x'
  - name: azureRegion
    value: 'eastus2'
```

**Usage:**
```yaml
variables:
  - template: templates/variables/common.yml
  - group: 'my-secrets'
  - name: customVar
    value: 'custom'
```

### Each Expression for Dynamic Generation

```yaml
parameters:
  - name: environments
    type: object
    default:
      - name: staging
        serviceConnection: 'Azure-Staging'
        appName: 'myapp-staging'
      - name: production
        serviceConnection: 'Azure-Production'
        appName: 'myapp-prod'

stages:
  - stage: Build
    jobs:
      - job: Build
        steps:
          - script: echo build

  - ${{ each env in parameters.environments }}:
    - stage: Deploy_${{ env.name }}
      displayName: 'Deploy to ${{ env.name }}'
      jobs:
        - deployment: Deploy
          environment: '${{ env.name }}'
          strategy:
            runOnce:
              deploy:
                steps:
                  - task: AzureWebApp@1
                    inputs:
                      azureSubscription: '${{ env.serviceConnection }}'
                      appName: '${{ env.appName }}'
```

---

## Service Connections and Managed Identity

### Azure Resource Manager Service Connection

Service connections are created in **Project Settings > Service Connections** (UI). The pipeline references them by name.

```yaml
# Reference in tasks
- task: AzureWebApp@1
  inputs:
    azureSubscription: 'my-service-connection'   # Name from Project Settings
    appName: 'my-app'

- task: AzureCLI@2
  inputs:
    azureSubscription: 'my-service-connection'
    scriptType: 'bash'
    scriptLocation: 'inlineScript'
    inlineScript: |
      az webapp list --output table
```

### Service Connection Types

| Type | Use Case |
|------|----------|
| Azure Resource Manager | Deploy to Azure resources (App Service, AKS, etc.) |
| Azure Resource Manager (Workload Identity) | Recommended -- uses federated credentials |
| Docker Registry | Push/pull container images |
| Kubernetes | Deploy to Kubernetes clusters |
| Generic | Custom service endpoints (REST APIs) |
| GitHub | Access GitHub repos |
| NuGet | Private NuGet feeds |

### Workload Identity Federation (Recommended)

Workload Identity Federation eliminates the need for secrets in service connections. Azure DevOps obtains a token via OIDC.

**Setup:**
1. Create Azure AD App Registration
2. Add Federated Credential for Azure DevOps
3. Create service connection with "Workload Identity Federation" auth
4. No client secret rotation required

```yaml
# Same usage -- the auth mechanism is transparent to the pipeline
- task: AzureCLI@2
  inputs:
    azureSubscription: 'my-wif-connection'  # Workload Identity Federation
    scriptType: 'bash'
    scriptLocation: 'inlineScript'
    inlineScript: |
      az account show
```

### Managed Identity for Self-Hosted Agents

When running on Azure VMs with managed identity:

```yaml
# Agent VM has system-assigned managed identity
# Service connection uses "Managed Identity" authentication
- task: AzureCLI@2
  inputs:
    azureSubscription: 'my-managed-identity-conn'
    scriptType: 'bash'
    scriptLocation: 'inlineScript'
    inlineScript: |
      # No credentials needed -- uses VM's managed identity
      az keyvault secret show --vault-name myvault --name mysecret
```

---

## Container Jobs and Self-Hosted Agents

### Container Jobs

Run jobs inside a Docker container:

```yaml
jobs:
  - job: BuildInContainer
    pool:
      vmImage: 'ubuntu-latest'
    container:
      image: 'mcr.microsoft.com/dotnet/sdk:8.0'
    steps:
      - script: dotnet --version
        displayName: 'Check .NET version'
      - script: dotnet build
        displayName: 'Build'
```

### Container with Service Containers

```yaml
resources:
  containers:
    - container: postgres
      image: postgres:16
      ports:
        - 5432:5432
      env:
        POSTGRES_PASSWORD: testpassword
        POSTGRES_DB: testdb
    - container: redis
      image: redis:7
      ports:
        - 6379:6379

jobs:
  - job: IntegrationTests
    pool:
      vmImage: 'ubuntu-latest'
    services:
      postgres: postgres
      redis: redis
    steps:
      - script: |
          echo "PostgreSQL: $(Agent.Services.postgres.ports.5432)"
          echo "Redis: $(Agent.Services.redis.ports.6379)"
        displayName: 'Show service ports'
      - task: DotNetCoreCLI@2
        inputs:
          command: 'test'
          projects: '**/*IntegrationTests.csproj'
        env:
          DB_CONNECTION: 'Host=postgres;Port=5432;Database=testdb;Username=postgres;Password=testpassword'
          REDIS_CONNECTION: 'redis:6379'
```

### Self-Hosted Agent Pools

```yaml
# Reference self-hosted pool
pool:
  name: 'my-self-hosted-pool'

# With demands (agent capabilities)
pool:
  name: 'my-self-hosted-pool'
  demands:
    - dotnet
    - Agent.OS -equals Linux

# With specific agent
pool:
  name: 'my-self-hosted-pool'
  demands:
    - Agent.Name -equals build-agent-01
```

### Scale Set Agents (VMSS)

```yaml
# Auto-scaling agent pool backed by Azure VM Scale Set
pool:
  name: 'vmss-agent-pool'
  # Agents scale automatically based on queue depth
```

---

## Pipeline Caching

### NuGet Cache

```yaml
variables:
  NUGET_PACKAGES: $(Pipeline.Workspace)/.nuget/packages

steps:
  - task: Cache@2
    displayName: 'Cache NuGet packages'
    inputs:
      key: 'nuget | "$(Agent.OS)" | **/packages.lock.json'
      restoreKeys: |
        nuget | "$(Agent.OS)"
        nuget
      path: '$(NUGET_PACKAGES)'

  - task: DotNetCoreCLI@2
    inputs:
      command: 'restore'
      projects: '**/*.csproj'
```

### npm Cache

```yaml
steps:
  - task: Cache@2
    displayName: 'Cache npm packages'
    inputs:
      key: 'npm | "$(Agent.OS)" | package-lock.json'
      restoreKeys: |
        npm | "$(Agent.OS)"
      path: '$(Pipeline.Workspace)/.npm'

  - script: npm ci --cache $(Pipeline.Workspace)/.npm
    displayName: 'Install dependencies'
```

### pip Cache

```yaml
steps:
  - task: Cache@2
    displayName: 'Cache pip packages'
    inputs:
      key: 'pip | "$(Agent.OS)" | requirements.txt'
      restoreKeys: |
        pip | "$(Agent.OS)"
      path: '$(Pipeline.Workspace)/.pip'

  - script: pip install --cache-dir $(Pipeline.Workspace)/.pip -r requirements.txt
    displayName: 'Install dependencies'
```

### Docker Layer Cache

```yaml
variables:
  DOCKER_BUILDKIT: 1

steps:
  - task: Cache@2
    displayName: 'Cache Docker layers'
    inputs:
      key: 'docker | "$(Agent.OS)" | Dockerfile'
      path: '$(Pipeline.Workspace)/docker-cache'
      restoreKeys: |
        docker | "$(Agent.OS)"

  - script: |
      docker build \
        --cache-from type=local,src=$(Pipeline.Workspace)/docker-cache \
        --cache-to type=local,dest=$(Pipeline.Workspace)/docker-cache,mode=max \
        -t myapp:$(Build.BuildId) .
    displayName: 'Build Docker image'
```

### Cache Key Patterns

```yaml
# Exact match
key: 'nuget | "$(Agent.OS)" | **/packages.lock.json'

# Fallback keys (tried in order)
restoreKeys: |
  nuget | "$(Agent.OS)"
  nuget

# Multiple files
key: 'npm | "$(Agent.OS)" | package-lock.json | packages/*/package-lock.json'
```

---

## Release Pipelines vs YAML Pipelines

### When to Use Each

| Feature | YAML Pipelines (Recommended) | Classic Release Pipelines |
|---------|-------------------------------|---------------------------|
| Version control | Yes (in repo) | No (stored in Azure DevOps) |
| Code review for changes | Yes (via PR) | No |
| Template reuse | Yes (`template:`, `extends:`) | Task groups (limited) |
| Multi-stage | Yes | Yes (stages UI) |
| Environment approvals | Yes (via Environments) | Yes (via release gates) |
| Manual intervention | Yes (`ManualValidation@0` task) | Yes (approval gates) |
| Rollback | Re-run previous build | Redeploy previous release |
| Gates (automated checks) | Environment checks | Release gates |
| Artifacts | Pipeline artifacts | Build artifacts + release artifacts |
| Branching support | Native (triggers) | Artifact filters |

**Recommendation**: Use YAML pipelines for all new projects. Classic release pipelines are legacy.

### Manual Validation Task (YAML equivalent of release gate)

```yaml
jobs:
  - deployment: Deploy
    environment: 'staging'
    strategy:
      runOnce:
        deploy:
          steps:
            - script: echo 'Deployed to staging'

  - job: ValidateStaging
    dependsOn: Deploy
    pool: server    # Runs on Azure DevOps server, not an agent
    steps:
      - task: ManualValidation@0
        displayName: 'Validate staging deployment'
        timeoutInMinutes: 1440    # 24 hours
        inputs:
          notifyUsers: 'team@example.com'
          instructions: |
            Please validate the staging deployment at https://staging.example.com
            Check: functionality, performance, no regressions
          onTimeout: 'reject'
```

---

## Azure CLI and Script Tasks

### AzureCLI Task

```yaml
# Bash script
- task: AzureCLI@2
  displayName: 'Azure CLI operations'
  inputs:
    azureSubscription: 'my-service-connection'
    scriptType: 'bash'
    scriptLocation: 'inlineScript'
    inlineScript: |
      # List resource groups
      az group list --output table

      # Deploy ARM template
      az deployment group create \
        --resource-group myResourceGroup \
        --template-file azuredeploy.json \
        --parameters @azuredeploy.parameters.json

      # Get and set output variable
      WEBAPP_URL=$(az webapp show -n myapp -g myrg --query defaultHostName -o tsv)
      echo "##vso[task.setvariable variable=webappUrl;isOutput=true]$WEBAPP_URL"
    addSpnToEnvironment: true    # Adds $servicePrincipalId, $servicePrincipalKey, $tenantId
```

```yaml
# PowerShell script
- task: AzureCLI@2
  displayName: 'Azure CLI (PowerShell)'
  inputs:
    azureSubscription: 'my-service-connection'
    scriptType: 'pscore'
    scriptLocation: 'inlineScript'
    inlineScript: |
      $rg = az group show -n myResourceGroup | ConvertFrom-Json
      Write-Host "Location: $($rg.location)"
```

```yaml
# Script from file
- task: AzureCLI@2
  inputs:
    azureSubscription: 'my-service-connection'
    scriptType: 'bash'
    scriptLocation: 'scriptPath'
    scriptPath: './scripts/deploy.sh'
    arguments: '--env staging --verbose'
```

### Script Tasks

```yaml
# Cross-platform script (uses cmd on Windows, bash on Linux/macOS)
- script: |
    echo "Build ID: $(Build.BuildId)"
    echo "Branch: $(Build.SourceBranchName)"
  displayName: 'Cross-platform script'

# Bash (explicit)
- bash: |
    set -euo pipefail
    echo "Running on $(uname -s)"
    ./build.sh
  displayName: 'Bash script'
  env:
    MY_SECRET: $(mySecret)

# PowerShell
- powershell: |
    Write-Host "PowerShell version: $($PSVersionTable.PSVersion)"
    Get-ChildItem -Recurse -Filter "*.csproj"
  displayName: 'PowerShell script'

# PowerShell Core (cross-platform)
- pwsh: |
    Write-Host "PowerShell Core on $($PSVersionTable.OS)"
  displayName: 'PowerShell Core script'
```

### Setting Output Variables

```yaml
jobs:
  - job: Setup
    steps:
      - bash: |
          VERSION=$(cat version.txt)
          echo "##vso[task.setvariable variable=appVersion;isOutput=true]$VERSION"
        name: getVersion
        displayName: 'Get version'

  - job: Build
    dependsOn: Setup
    variables:
      appVersion: $[ dependencies.Setup.outputs['getVersion.appVersion'] ]
    steps:
      - script: echo "Building version $(appVersion)"
```

### Logging Commands

```yaml
steps:
  - script: |
      # Set variable
      echo "##vso[task.setvariable variable=myVar]myValue"

      # Set secret variable
      echo "##vso[task.setvariable variable=mySecret;issecret=true]secretValue"

      # Set output variable (accessible from other jobs)
      echo "##vso[task.setvariable variable=myOutput;isOutput=true]outputValue"

      # Upload artifact
      echo "##vso[artifact.upload containerfolder=drop;artifactname=myartifact]$(Build.ArtifactStagingDirectory)/file.zip"

      # Add build tag
      echo "##vso[build.addbuildtag]release-candidate"

      # Update build number
      echo "##vso[build.updatebuildnumber]1.0.$(Build.BuildId)"

      # Log warning
      echo "##vso[task.logissue type=warning]This is a warning"

      # Log error
      echo "##vso[task.logissue type=error;sourcepath=src/app.cs;linenumber=42]Compilation error"

      # Complete task with result
      echo "##vso[task.complete result=SucceededWithIssues;]Done with warnings"
    displayName: 'Logging commands'
```

---

## Docker Build and Push

### Docker Task

```yaml
variables:
  dockerRegistryServiceConnection: 'my-acr-connection'
  imageRepository: 'myapp'
  containerRegistry: 'myregistry.azurecr.io'
  dockerfilePath: '$(Build.SourcesDirectory)/Dockerfile'
  tag: '$(Build.BuildId)'

steps:
  - task: Docker@2
    displayName: 'Build and push'
    inputs:
      command: 'buildAndPush'
      repository: '$(imageRepository)'
      dockerfile: '$(dockerfilePath)'
      containerRegistry: '$(dockerRegistryServiceConnection)'
      tags: |
        $(tag)
        latest
```

### Multi-Stage Docker Build

```yaml
steps:
  - task: Docker@2
    displayName: 'Build image'
    inputs:
      command: 'build'
      repository: '$(imageRepository)'
      dockerfile: '$(dockerfilePath)'
      containerRegistry: '$(dockerRegistryServiceConnection)'
      arguments: '--target production --build-arg BUILD_VERSION=$(Build.BuildId)'
      tags: '$(tag)'

  - task: Docker@2
    displayName: 'Push image'
    inputs:
      command: 'push'
      repository: '$(imageRepository)'
      containerRegistry: '$(dockerRegistryServiceConnection)'
      tags: '$(tag)'
```

---

## Terraform Integration

### Terraform in Azure DevOps

```yaml
variables:
  - group: 'terraform-backend'    # Contains ARM_ACCESS_KEY, etc.
  - name: terraformVersion
    value: '1.7.0'

stages:
  - stage: Plan
    jobs:
      - job: TerraformPlan
        steps:
          - task: TerraformInstaller@1
            displayName: 'Install Terraform'
            inputs:
              terraformVersion: '$(terraformVersion)'

          - task: TerraformCLI@1
            displayName: 'Terraform Init'
            inputs:
              command: 'init'
              workingDirectory: '$(System.DefaultWorkingDirectory)/terraform'
              backendType: 'azurerm'
              backendServiceArm: 'my-service-connection'
              backendAzureRmResourceGroupName: 'rg-terraform-state'
              backendAzureRmStorageAccountName: 'tfstate'
              backendAzureRmContainerName: 'state'
              backendAzureRmKey: 'myapp.tfstate'

          - task: TerraformCLI@1
            displayName: 'Terraform Plan'
            inputs:
              command: 'plan'
              workingDirectory: '$(System.DefaultWorkingDirectory)/terraform'
              environmentServiceName: 'my-service-connection'
              commandOptions: '-out=tfplan'

          - task: PublishPipelineArtifact@1
            inputs:
              targetPath: '$(System.DefaultWorkingDirectory)/terraform/tfplan'
              artifact: 'tfplan'

  - stage: Apply
    dependsOn: Plan
    jobs:
      - deployment: TerraformApply
        environment: 'infrastructure'
        strategy:
          runOnce:
            deploy:
              steps:
                - task: DownloadPipelineArtifact@2
                  inputs:
                    artifactName: 'tfplan'
                    targetPath: '$(System.DefaultWorkingDirectory)/terraform'

                - task: TerraformCLI@1
                  displayName: 'Terraform Apply'
                  inputs:
                    command: 'apply'
                    workingDirectory: '$(System.DefaultWorkingDirectory)/terraform'
                    environmentServiceName: 'my-service-connection'
                    commandOptions: 'tfplan'
```

---

## Advanced Variable Patterns

### Variable Scoping

```yaml
# Pipeline-level variables (available to all stages)
variables:
  - name: globalVar
    value: 'available-everywhere'

stages:
  - stage: Build
    variables:
      - name: stageVar
        value: 'available-in-build-stage-only'
    jobs:
      - job: Compile
        variables:
          - name: jobVar
            value: 'available-in-compile-job-only'
        steps:
          - script: |
              echo "Global: $(globalVar)"
              echo "Stage: $(stageVar)"
              echo "Job: $(jobVar)"
```

### Dynamic Variables Between Stages

```yaml
stages:
  - stage: Build
    jobs:
      - job: BuildJob
        steps:
          - bash: |
              echo "##vso[task.setvariable variable=imageTag;isOutput=true]$(Build.BuildId)"
            name: setTag

  - stage: Deploy
    dependsOn: Build
    variables:
      imageTag: $[ stageDependencies.Build.BuildJob.outputs['setTag.imageTag'] ]
    jobs:
      - deployment: Deploy
        environment: 'staging'
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo "Deploying image tag $(imageTag)"
```

### Conditional Variable Values

```yaml
variables:
  - name: environment
    ${{ if eq(variables['Build.SourceBranch'], 'refs/heads/main') }}:
      value: 'production'
    ${{ elseif eq(variables['Build.SourceBranch'], 'refs/heads/develop') }}:
      value: 'staging'
    ${{ else }}:
      value: 'development'
```

### Counter Variables

```yaml
variables:
  - name: buildRevision
    value: $[counter(variables['Build.SourceBranchName'], 0)]
  - name: buildNumber
    value: '1.0.$(buildRevision)'
```

---

## Security and Compliance

### Secure Files

```yaml
steps:
  - task: DownloadSecureFile@1
    displayName: 'Download certificate'
    name: secureCert
    inputs:
      secureFile: 'my-certificate.pfx'

  - script: |
      echo "Certificate path: $(secureCert.secureFilePath)"
      cp $(secureCert.secureFilePath) /tmp/cert.pfx
    displayName: 'Use certificate'
```

### Branch Policies

Configure in **Repos > Branches > Branch policies**:
- Require minimum number of reviewers
- Check for linked work items
- Check for comment resolution
- Build validation (require successful pipeline run)
- Automatically include reviewers

### Pipeline Permissions

```yaml
# Restrict pipeline to specific repos/resources
resources:
  repositories:
    - repository: templates
      type: git
      name: MyProject/pipeline-templates
      ref: refs/heads/main

  pipelines:
    - pipeline: buildPipeline
      source: 'My Build Pipeline'
      trigger:
        branches:
          include:
            - main
```

### Audit and Compliance

```yaml
# Add compliance metadata as tags
steps:
  - script: |
      echo "##vso[build.addbuildtag]security-scanned"
      echo "##vso[build.addbuildtag]compliance-approved"
    displayName: 'Add compliance tags'
    condition: succeeded()
```

---

## Troubleshooting

### Common Pipeline Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `No pool was specified` | Missing `pool:` definition | Add `pool: vmImage: 'ubuntu-latest'` |
| `Template not found` | Wrong template path or missing `@repoAlias` | Check `resources.repositories` and path |
| `Variable not available` | Wrong scoping or missing `isOutput: true` | Check variable scope and output syntax |
| `Environment not found` | Environment not created | Create in Pipelines > Environments |
| `Service connection unauthorized` | Pipeline not authorized | Authorize in service connection settings |
| `Task version not found` | Wrong task version number | Check marketplace for correct version |

### Debug Mode

```yaml
# Enable system diagnostics
variables:
  - name: system.debug
    value: true

# Or set in pipeline run UI: "Enable system diagnostics"
```

### Common Task Version Reference

| Task | Current Version | Purpose |
|------|----------------|---------|
| `UseDotNet@2` | 2 | Install .NET SDK |
| `DotNetCoreCLI@2` | 2 | .NET CLI commands |
| `AzureCLI@2` | 2 | Azure CLI commands |
| `AzureWebApp@1` | 1 | Deploy to App Service |
| `AzureKeyVault@2` | 2 | Fetch Key Vault secrets |
| `Docker@2` | 2 | Docker build/push |
| `PublishPipelineArtifact@1` | 1 | Publish artifacts |
| `DownloadPipelineArtifact@2` | 2 | Download artifacts |
| `PublishBuildArtifacts@1` | 1 | Publish build artifacts (legacy) |
| `DownloadBuildArtifacts@1` | 1 | Download build artifacts (legacy) |
| `PublishTestResults@2` | 2 | Publish test results |
| `PublishCodeCoverageResults@2` | 2 | Publish code coverage |
| `Cache@2` | 2 | Pipeline caching |
| `ManualValidation@0` | 0 | Manual approval gate |
| `TerraformInstaller@1` | 1 | Install Terraform |
| `TerraformCLI@1` | 1 | Terraform CLI commands |

---

**Last Updated**: 2026-02-23 | **Version**: 1.0.0
