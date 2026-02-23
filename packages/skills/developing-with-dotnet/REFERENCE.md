# .NET Development Comprehensive Reference

**Version**: 1.0.0 | **.NET**: 9.0 | **Use Case**: Advanced patterns, deep dives

---

## Table of Contents

1. [Full Clean Architecture Template Walkthrough](#1-full-clean-architecture-template-walkthrough)
2. [Advanced MediatR Patterns](#2-advanced-mediatr-patterns)
3. [Domain-Driven Design Patterns](#3-domain-driven-design-patterns)
4. [Testing Patterns](#4-testing-patterns)
5. [.NET 9 AOT Compilation Considerations](#5-net-9-aot-compilation-considerations)
6. [MediatR Licensing and Alternatives](#6-mediatr-licensing-and-alternatives)
7. [Common NuGet Packages](#7-common-nuget-packages)

---

## 1. Full Clean Architecture Template Walkthrough

### Solution Structure

```
MyApp.sln
src/
  MyApp.Domain/
    MyApp.Domain.csproj
    Common/
      BaseEntity.cs                # Shared entity base class
      BaseDomainEvent.cs           # Domain event base
      IAuditableEntity.cs          # Audit timestamp interface
    Entities/
      Order.cs
      OrderItem.cs
      Product.cs
      Customer.cs
    ValueObjects/
      Money.cs
      Address.cs
      Email.cs
    Enums/
      OrderStatus.cs
    Events/
      OrderCreatedEvent.cs
      OrderCompletedEvent.cs
    Exceptions/
      DomainException.cs
      OrderValidationException.cs
    Interfaces/
      IOrderRepository.cs
      IProductRepository.cs

  MyApp.Application/
    MyApp.Application.csproj
    Common/
      Behaviors/
        ValidationBehavior.cs
        LoggingBehavior.cs
        CachingBehavior.cs
        UnhandledExceptionBehavior.cs
      Interfaces/
        IApplicationDbContext.cs
        IUnitOfWork.cs
        ICacheService.cs
        ICurrentUserService.cs
      Mappings/
        MappingProfile.cs
      Models/
        PaginatedList.cs
        Result.cs
    Features/
      Orders/
        Commands/
          CreateOrder/
            CreateOrderCommand.cs
            CreateOrderCommandHandler.cs
            CreateOrderCommandValidator.cs
          UpdateOrderStatus/
            UpdateOrderStatusCommand.cs
            UpdateOrderStatusCommandHandler.cs
        Queries/
          GetOrderById/
            GetOrderByIdQuery.cs
            GetOrderByIdQueryHandler.cs
            OrderDto.cs
          GetOrdersList/
            GetOrdersListQuery.cs
            GetOrdersListQueryHandler.cs
    DependencyInjection.cs

  MyApp.Infrastructure/
    MyApp.Infrastructure.csproj
    Data/
      ApplicationDbContext.cs
      Configurations/
        OrderConfiguration.cs
        ProductConfiguration.cs
      Migrations/
      Interceptors/
        AuditableEntityInterceptor.cs
        SoftDeleteInterceptor.cs
    Repositories/
      OrderRepository.cs
      ProductRepository.cs
    Services/
      DateTimeProvider.cs
      CurrentUserService.cs
      CacheService.cs
    DependencyInjection.cs

  MyApp.WebApi/
    MyApp.WebApi.csproj
    Endpoints/
      OrderEndpoints.cs
      ProductEndpoints.cs
    Filters/
      GlobalExceptionHandler.cs
    Middleware/
      RequestTimingMiddleware.cs
    Program.cs
    appsettings.json

tests/
  MyApp.Domain.Tests/
  MyApp.Application.Tests/
  MyApp.Infrastructure.Tests/
  MyApp.WebApi.Tests/
```

### Cross-Cutting Concerns

#### Auditable Entity Interceptor

```csharp
// Infrastructure/Data/Interceptors/AuditableEntityInterceptor.cs
public sealed class AuditableEntityInterceptor : SaveChangesInterceptor
{
    private readonly ICurrentUserService _currentUser;
    private readonly TimeProvider _timeProvider;

    public AuditableEntityInterceptor(
        ICurrentUserService currentUser,
        TimeProvider timeProvider)
    {
        _currentUser = currentUser;
        _timeProvider = timeProvider;
    }

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        UpdateEntities(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        UpdateEntities(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void UpdateEntities(DbContext? context)
    {
        if (context is null) return;

        var now = _timeProvider.GetUtcNow();
        var userId = _currentUser.UserId;

        foreach (var entry in context.ChangeTracker.Entries<IAuditableEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedBy = userId;
                entry.Entity.CreatedAt = now;
            }

            if (entry.State is EntityState.Added or EntityState.Modified)
            {
                entry.Entity.LastModifiedBy = userId;
                entry.Entity.LastModifiedAt = now;
            }
        }
    }
}
```

#### Soft Delete Interceptor

```csharp
public sealed class SoftDeleteInterceptor : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is null)
            return base.SavingChangesAsync(eventData, result, cancellationToken);

        foreach (var entry in eventData.Context.ChangeTracker
            .Entries<ISoftDeletable>()
            .Where(e => e.State == EntityState.Deleted))
        {
            entry.State = EntityState.Modified;
            entry.Entity.IsDeleted = true;
            entry.Entity.DeletedAt = DateTimeOffset.UtcNow;
        }

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}
```

#### Program.cs Wiring

```csharp
// WebApi/Program.cs
var builder = WebApplication.CreateBuilder(args);

// Layer-specific DI extension methods
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

// OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ProblemDetails
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();

// Map endpoint groups
app.MapOrderEndpoints();
app.MapProductEndpoints();

app.Run();

// Required for WebApplicationFactory integration testing
public partial class Program { }
```

---

## 2. Advanced MediatR Patterns

### Caching Behavior

```csharp
public interface ICacheableQuery
{
    string CacheKey { get; }
    TimeSpan? CacheDuration { get; }
}

public sealed class CachingBehavior<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IDistributedCache _cache;
    private readonly ILogger<CachingBehavior<TRequest, TResponse>> _logger;

    public CachingBehavior(
        IDistributedCache cache,
        ILogger<CachingBehavior<TRequest, TResponse>> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (request is not ICacheableQuery cacheableQuery)
            return await next();

        var cachedResult = await _cache.GetStringAsync(
            cacheableQuery.CacheKey, cancellationToken);

        if (cachedResult is not null)
        {
            _logger.LogDebug(
                "Cache hit for {CacheKey}", cacheableQuery.CacheKey);
            return JsonSerializer.Deserialize<TResponse>(cachedResult)!;
        }

        var response = await next();

        var options = new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow =
                cacheableQuery.CacheDuration ?? TimeSpan.FromMinutes(5),
        };

        await _cache.SetStringAsync(
            cacheableQuery.CacheKey,
            JsonSerializer.Serialize(response),
            options,
            cancellationToken);

        return response;
    }
}
```

### Exception Handling Behavior

```csharp
public sealed class UnhandledExceptionBehavior<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly ILogger<UnhandledExceptionBehavior<TRequest, TResponse>> _logger;

    public UnhandledExceptionBehavior(
        ILogger<UnhandledExceptionBehavior<TRequest, TResponse>> logger)
    {
        _logger = logger;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        try
        {
            return await next();
        }
        catch (Exception ex)
        {
            var requestName = typeof(TRequest).Name;
            _logger.LogError(
                ex,
                "Unhandled exception for request {RequestName}: {@Request}",
                requestName, request);
            throw;
        }
    }
}
```

### Registering Pipeline Behaviors

```csharp
// Application/DependencyInjection.cs
public static IServiceCollection AddApplication(
    this IServiceCollection services)
{
    var assembly = typeof(DependencyInjection).Assembly;

    services.AddMediatR(cfg =>
    {
        cfg.RegisterServicesFromAssembly(assembly);
        // Order matters: outermost behavior first
        cfg.AddBehavior(typeof(IPipelineBehavior<,>),
            typeof(UnhandledExceptionBehavior<,>));
        cfg.AddBehavior(typeof(IPipelineBehavior<,>),
            typeof(LoggingBehavior<,>));
        cfg.AddBehavior(typeof(IPipelineBehavior<,>),
            typeof(ValidationBehavior<,>));
        cfg.AddBehavior(typeof(IPipelineBehavior<,>),
            typeof(CachingBehavior<,>));
    });

    services.AddValidatorsFromAssembly(assembly);

    return services;
}
```

### Domain Event Dispatching via MediatR

```csharp
// Domain events published after SaveChanges
public sealed class DomainEventDispatcherInterceptor : SaveChangesInterceptor
{
    private readonly IMediator _mediator;

    public DomainEventDispatcherInterceptor(IMediator mediator)
    {
        _mediator = mediator;
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is not null)
        {
            var entities = eventData.Context.ChangeTracker
                .Entries<BaseEntity>()
                .Where(e => e.Entity.DomainEvents.Count > 0)
                .Select(e => e.Entity)
                .ToList();

            var domainEvents = entities
                .SelectMany(e => e.DomainEvents)
                .ToList();

            entities.ForEach(e => e.ClearDomainEvents());

            foreach (var domainEvent in domainEvents)
            {
                await _mediator.Publish(domainEvent, cancellationToken);
            }
        }

        return await base.SavedChangesAsync(
            eventData, result, cancellationToken);
    }
}
```

---

## 3. Domain-Driven Design Patterns

### Entity Base Class

```csharp
public abstract class BaseEntity
{
    public Guid Id { get; protected init; }

    private readonly List<BaseDomainEvent> _domainEvents = [];

    public IReadOnlyCollection<BaseDomainEvent> DomainEvents =>
        _domainEvents.AsReadOnly();

    public void AddDomainEvent(BaseDomainEvent domainEvent)
    {
        _domainEvents.Add(domainEvent);
    }

    public void ClearDomainEvents()
    {
        _domainEvents.Clear();
    }
}

public abstract class BaseDomainEvent : INotification
{
    public DateTimeOffset OccurredOn { get; } = DateTimeOffset.UtcNow;
}
```

### Value Objects with IEquatable

```csharp
public sealed class Money : IEquatable<Money>
{
    public decimal Amount { get; }
    public string Currency { get; }

    private Money(decimal amount, string currency)
    {
        if (amount < 0)
            throw new ArgumentException("Amount cannot be negative", nameof(amount));
        if (string.IsNullOrWhiteSpace(currency) || currency.Length != 3)
            throw new ArgumentException("Currency must be a 3-letter ISO code", nameof(currency));

        Amount = amount;
        Currency = currency.ToUpperInvariant();
    }

    public static Money Create(decimal amount, string currency) =>
        new(amount, currency);

    public static Money Zero(string currency) =>
        new(0, currency);

    public Money Add(Money other)
    {
        if (Currency != other.Currency)
            throw new InvalidOperationException(
                $"Cannot add {Currency} and {other.Currency}");
        return new Money(Amount + other.Amount, Currency);
    }

    public bool Equals(Money? other)
    {
        if (other is null) return false;
        return Amount == other.Amount && Currency == other.Currency;
    }

    public override bool Equals(object? obj) => Equals(obj as Money);

    public override int GetHashCode() => HashCode.Combine(Amount, Currency);

    public static bool operator ==(Money? left, Money? right) =>
        Equals(left, right);

    public static bool operator !=(Money? left, Money? right) =>
        !Equals(left, right);

    public override string ToString() => $"{Amount} {Currency}";
}
```

### Strongly-Typed IDs

```csharp
public readonly record struct OrderId(Guid Value)
{
    public static OrderId NewId() => new(Guid.NewGuid());
    public override string ToString() => Value.ToString();
}

// EF Core configuration
builder.Property(o => o.Id)
    .HasConversion(
        id => id.Value,
        value => new OrderId(value));
```

### Aggregate Root

```csharp
public sealed class Order : BaseEntity
{
    private readonly List<OrderItem> _items = [];

    public string CustomerId { get; private set; } = null!;
    public OrderStatus Status { get; private set; }
    public Money Total { get; private set; } = null!;
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    // Private constructor for EF Core
    private Order() { }

    public static Order Create(
        string customerId,
        List<OrderItemDto> items)
    {
        if (string.IsNullOrWhiteSpace(customerId))
            throw new DomainException("Customer ID is required");

        if (items.Count == 0)
            throw new DomainException("Order must have at least one item");

        var order = new Order
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            Status = OrderStatus.Pending,
        };

        foreach (var item in items)
        {
            order.AddItem(item.ProductId, item.Quantity, item.UnitPrice);
        }

        order.RecalculateTotal();
        order.AddDomainEvent(new OrderCreatedEvent(order.Id));

        return order;
    }

    public void AddItem(Guid productId, int quantity, decimal unitPrice)
    {
        if (Status != OrderStatus.Pending)
            throw new DomainException("Cannot modify a non-pending order");

        var item = new OrderItem(productId, quantity, unitPrice);
        _items.Add(item);
        RecalculateTotal();
    }

    public void Complete()
    {
        if (Status != OrderStatus.Pending)
            throw new DomainException("Only pending orders can be completed");

        Status = OrderStatus.Completed;
        AddDomainEvent(new OrderCompletedEvent(Id));
    }

    private void RecalculateTotal()
    {
        var total = _items.Sum(i => i.Quantity * i.UnitPrice);
        Total = Money.Create(total, "USD");
    }
}
```

### Domain Events

```csharp
public sealed class OrderCreatedEvent : BaseDomainEvent
{
    public Guid OrderId { get; }

    public OrderCreatedEvent(Guid orderId)
    {
        OrderId = orderId;
    }
}

// Handler
public sealed class OrderCreatedEventHandler
    : INotificationHandler<OrderCreatedEvent>
{
    private readonly ILogger<OrderCreatedEventHandler> _logger;

    public OrderCreatedEventHandler(
        ILogger<OrderCreatedEventHandler> logger)
    {
        _logger = logger;
    }

    public Task Handle(
        OrderCreatedEvent notification,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Order {OrderId} created at {OccurredOn}",
            notification.OrderId,
            notification.OccurredOn);

        return Task.CompletedTask;
    }
}
```

---

## 4. Testing Patterns

### xUnit + FluentAssertions + NSubstitute Setup

```xml
<!-- MyApp.Application.Tests.csproj -->
<ItemGroup>
  <PackageReference Include="xunit" Version="2.9.*" />
  <PackageReference Include="xunit.runner.visualstudio" Version="2.8.*" />
  <PackageReference Include="FluentAssertions" Version="7.*" />
  <PackageReference Include="NSubstitute" Version="5.*" />
  <PackageReference Include="NSubstitute.Analyzers.CSharp" Version="1.*" />
  <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.*" />
  <PackageReference Include="coverlet.collector" Version="6.*" />
</ItemGroup>
```

### Unit Test Organization

```csharp
// Tests follow the pattern: MethodUnderTest_Scenario_ExpectedResult
public sealed class CreateOrderCommandHandlerTests
{
    private readonly IOrderRepository _orderRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly CreateOrderCommandHandler _sut;

    public CreateOrderCommandHandlerTests()
    {
        _orderRepository = Substitute.For<IOrderRepository>();
        _unitOfWork = Substitute.For<IUnitOfWork>();
        _sut = new CreateOrderCommandHandler(_orderRepository, _unitOfWork);
    }

    [Fact]
    public async Task Handle_ValidCommand_ReturnsOrderId()
    {
        // Arrange
        var command = new CreateOrderCommand(
            "customer-1",
            [new OrderItemDto("product-1", 2, 10.00m)]);

        _unitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(1));

        // Act
        var result = await _sut.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeEmpty();
        _orderRepository.Received(1).Add(Arg.Is<Order>(o =>
            o.CustomerId == "customer-1" &&
            o.Items.Count == 1));
        await _unitOfWork.Received(1)
            .SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_EmptyItems_ThrowsDomainException()
    {
        // Arrange
        var command = new CreateOrderCommand("customer-1", []);

        // Act
        var act = () => _sut.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<DomainException>()
            .WithMessage("*at least one item*");
    }
}
```

### Domain Entity Tests

```csharp
public sealed class MoneyTests
{
    [Theory]
    [InlineData(10.00, "USD", 5.00, "USD", 15.00)]
    [InlineData(0, "EUR", 100.50, "EUR", 100.50)]
    public void Add_SameCurrency_ReturnsSummedMoney(
        decimal amount1, string currency1,
        decimal amount2, string currency2,
        decimal expected)
    {
        var money1 = Money.Create(amount1, currency1);
        var money2 = Money.Create(amount2, currency2);

        var result = money1.Add(money2);

        result.Amount.Should().Be(expected);
        result.Currency.Should().Be(currency1);
    }

    [Fact]
    public void Add_DifferentCurrency_ThrowsInvalidOperation()
    {
        var usd = Money.Create(10, "USD");
        var eur = Money.Create(5, "EUR");

        var act = () => usd.Add(eur);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Cannot add*");
    }

    [Fact]
    public void Create_NegativeAmount_ThrowsArgumentException()
    {
        var act = () => Money.Create(-1, "USD");

        act.Should().Throw<ArgumentException>()
            .WithMessage("*cannot be negative*");
    }

    [Fact]
    public void Equals_SameAmountAndCurrency_ReturnsTrue()
    {
        var money1 = Money.Create(10, "USD");
        var money2 = Money.Create(10, "USD");

        money1.Should().Be(money2);
        (money1 == money2).Should().BeTrue();
    }
}
```

### Integration Testing with WebApplicationFactory

```csharp
// Shared fixture for test database
public sealed class IntegrationTestFixture : IAsyncLifetime
{
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    // Replace DbContext with test database
                    var descriptor = services.SingleOrDefault(
                        d => d.ServiceType == typeof(
                            DbContextOptions<ApplicationDbContext>));
                    if (descriptor is not null)
                        services.Remove(descriptor);

                    services.AddDbContext<ApplicationDbContext>(options =>
                        options.UseInMemoryDatabase("TestDb"));
                });
            });

        Client = Factory.CreateClient();
        await Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        Client.Dispose();
        await Factory.DisposeAsync();
    }
}

// Integration test
public sealed class OrderEndpointTests : IClassFixture<IntegrationTestFixture>
{
    private readonly HttpClient _client;

    public OrderEndpointTests(IntegrationTestFixture fixture)
    {
        _client = fixture.Client;
    }

    [Fact]
    public async Task CreateOrder_ValidRequest_Returns201()
    {
        // Arrange
        var request = new
        {
            CustomerId = "customer-1",
            Items = new[] { new { ProductId = Guid.NewGuid(), Quantity = 1, UnitPrice = 10.00m } }
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/orders", request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var orderId = await response.Content.ReadFromJsonAsync<Guid>();
        orderId.Should().NotBeEmpty();
    }

    [Fact]
    public async Task GetOrderById_NonExistent_Returns404()
    {
        var response = await _client.GetAsync(
            $"/api/orders/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
```

---

## 5. .NET 9 AOT Compilation Considerations

### What Works with AOT

- Minimal APIs with `TypedResults`
- System.Text.Json source-generated serialization
- Dependency injection (constructor injection)
- EF Core (with limitations)
- gRPC
- Health checks

### What Does NOT Work with AOT

- Reflection-based serialization (`System.Text.Json` without source gen)
- `System.Reflection.Emit` (dynamic type generation)
- MediatR (relies on open generic registration via reflection)
- AutoMapper (reflection-based mapping)
- Some FluentValidation patterns
- Razor Pages / MVC (use minimal APIs instead)

### Trimming-Safe JSON Serialization

```csharp
// Source-generated JSON context required for AOT
[JsonSerializable(typeof(OrderDto))]
[JsonSerializable(typeof(List<OrderDto>))]
[JsonSerializable(typeof(ProblemDetails))]
public partial class AppJsonSerializerContext : JsonSerializerContext
{
}

// Program.cs
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.TypeInfoResolverChain.Insert(
        0, AppJsonSerializerContext.Default);
});
```

### AOT-Compatible Project Configuration

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>
  <TrimMode>full</TrimMode>
  <InvariantGlobalization>true</InvariantGlobalization>
</PropertyGroup>
```

### Trimming Warning Suppression (when justified)

```csharp
// Only suppress when you have verified the code path is safe
[UnconditionalSuppressMessage(
    "Trimming",
    "IL2026:RequiresUnreferencedCode",
    Justification = "Type is preserved via JsonSerializable attribute")]
public static void RegisterTypes() { }
```

---

## 6. MediatR Licensing and Alternatives

### MediatR License Change (v13+)

Starting with MediatR v13, a **commercial license is required for
organizations with more than $5 million USD in annual gross revenue**.
Open-source and smaller organizations can continue using it freely.

Key points:
- v12.x remains MIT licensed and fully functional
- v13+ adds features but requires commercial license for large organizations
- The pipeline behavior constraint change (`where TRequest : notnull`)
  was introduced in v12

### Alternative: Mediator Source Generator

The [Mediator](https://github.com/martinothamar/Mediator) package is a
source-generated alternative that is AOT-compatible and MIT licensed.

```csharp
// Install: Mediator.SourceGenerator
// Usage is nearly identical to MediatR

[GenerateMediator]
public partial class CreateOrderCommand : ICommand<Guid>
{
    public required string CustomerId { get; init; }
    public required List<OrderItemDto> Items { get; init; }
}

public sealed class CreateOrderCommandHandler
    : ICommandHandler<CreateOrderCommand, Guid>
{
    public async ValueTask<Guid> Handle(
        CreateOrderCommand command,
        CancellationToken cancellationToken)
    {
        // Same implementation logic
    }
}
```

Advantages over MediatR:
- Source-generated (AOT compatible, no reflection)
- Faster startup and runtime performance
- MIT licensed with no revenue restrictions
- API is intentionally similar to MediatR for easy migration

---

## 7. Common NuGet Packages

### Core Application Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `MediatR` | 12.x / 13.x | CQRS mediator pattern |
| `FluentValidation` | 11.x | Input validation |
| `FluentValidation.DependencyInjectionExtensions` | 11.x | DI integration for validators |
| `Mapster` | 7.x | High-performance object mapping |
| `AutoMapper` | 13.x | Convention-based object mapping |

### Entity Framework Core

| Package | Version | Purpose |
|---------|---------|---------|
| `Microsoft.EntityFrameworkCore` | 9.x | Core ORM |
| `Microsoft.EntityFrameworkCore.Design` | 9.x | Migration tooling |
| `Npgsql.EntityFrameworkCore.PostgreSQL` | 9.x | PostgreSQL provider |
| `Pomelo.EntityFrameworkCore.MySql` | 9.x | MySQL / MariaDB provider |
| `Microsoft.EntityFrameworkCore.SqlServer` | 9.x | SQL Server provider |
| `Microsoft.EntityFrameworkCore.InMemory` | 9.x | In-memory provider (testing) |

### Logging and Observability

| Package | Version | Purpose |
|---------|---------|---------|
| `Serilog.AspNetCore` | 8.x | Structured logging |
| `Serilog.Sinks.Console` | 6.x | Console output |
| `Serilog.Sinks.Seq` | 8.x | Seq log aggregation |
| `OpenTelemetry.Extensions.Hosting` | 1.x | Distributed tracing |
| `OpenTelemetry.Exporter.Prometheus.AspNetCore` | 1.x | Metrics export |

### Authentication and Security

| Package | Version | Purpose |
|---------|---------|---------|
| `Microsoft.AspNetCore.Authentication.JwtBearer` | 9.x | JWT authentication |
| `Microsoft.Identity.Web` | 3.x | Azure AD / Entra ID |
| `System.IdentityModel.Tokens.Jwt` | 8.x | JWT token handling |

### Testing

| Package | Version | Purpose |
|---------|---------|---------|
| `xunit` | 2.9.x | Test framework |
| `xunit.runner.visualstudio` | 2.8.x | VS Test runner |
| `FluentAssertions` | 7.x | Fluent assertion syntax |
| `NSubstitute` | 5.x | Mocking library |
| `NSubstitute.Analyzers.CSharp` | 1.x | NSubstitute code analysis |
| `Microsoft.AspNetCore.Mvc.Testing` | 9.x | Integration test host |
| `Testcontainers` | 4.x | Docker-based test infra |
| `coverlet.collector` | 6.x | Code coverage collection |
| `Microsoft.NET.Test.Sdk` | 17.x | Test SDK |

### API Documentation

| Package | Version | Purpose |
|---------|---------|---------|
| `Swashbuckle.AspNetCore` | 7.x | Swagger / OpenAPI |
| `NSwag.AspNetCore` | 14.x | Alternative OpenAPI tooling |

### Caching and Resilience

| Package | Version | Purpose |
|---------|---------|---------|
| `Microsoft.Extensions.Caching.StackExchangeRedis` | 9.x | Redis distributed cache |
| `Microsoft.Extensions.Http.Resilience` | 9.x | HTTP resilience (Polly v8) |
| `Polly` | 8.x | Resilience and transient fault handling |

---

## See Also

- [SKILL.md](SKILL.md) - Quick reference for common patterns
- [Microsoft .NET Documentation](https://learn.microsoft.com/dotnet/)
- [Clean Architecture Template](https://github.com/jasontaylordev/CleanArchitecture)
- [Ardalis Clean Architecture](https://github.com/ardalis/CleanArchitecture)
