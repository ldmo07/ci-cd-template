var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/", () => "dotnet-example OK");
app.Run();
