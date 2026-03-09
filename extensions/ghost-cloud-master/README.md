# Ghost Cloud-Master

AI-powered infrastructure-as-code generator and cloud auditing assistant for the Ghost CLI ecosystem.

## Phase 2: IaC Template Generation (Completed)
This phase introduced the automated generation of Infrastructure-as-Code templates.

### New Features
- **Multi-Format IaC**: Supports generating both Terraform (`.tf`) and CloudFormation (`.yml`) templates.
- **AI-Powered Synthesis**: Synthesizes complete, production-ready infrastructure definitions based on detected project needs.
- **Security-First Templates**: Enforces encryption and least-privilege access rules in generated cloud resources.

### New Commands
- `ghost cloud generate [--format terraform|cloudformation]`: Generates infrastructure templates in the `infra/` folder.

## Installation
```bash
ghost marketplace install ghost-cloud-master
```
