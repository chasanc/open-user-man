# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The IT administrator of one organisation (a company or plant). They open the console a few times a week to create accounts, put people into groups, and decide who holds which access right. Integrating developers are a secondary audience and mostly use the gRPC API, not this UI.

## Product Purpose

Open User Man (`oum`) is a self-hosted user, group and permission service. The web app is its admin console over the REST API. Success means an administrator can see who can do what, and change it, without touching the database.

## Positioning

Self-hosted and owned by the operator: it runs on the operator's own Postgres or SQL Server, with no vendor tenant, as one Nest process serving REST and gRPC.

## Operating Context

- Entities: users, user groups, permissions, grants (who holds which permission where), companies (tenants), scopes (a tree that says where grants apply).
- A user holds their own grants plus those of every active group they belong to. Groups are flat. A grant at a scope covers its descendants.
- Companies, users, groups, permissions and scopes are deactivated (restorable) and can then be removed permanently; grants are removed outright. Every change is audited.
- The console needs a valid password and the company-wide `oum.admin` permission.
- Optional multi-company mode scopes data by company.
- Other applications call the same service over gRPC.

## Capabilities and Constraints

- Next.js 16 and React 19 app in `apps/web`, talking to the API as REST JSON; it never speaks gRPC.
- Pages today: login, user, usergroup, permission, company, scope, language, about.
- Domain terms are fixed by `CONTEXT.md`: Permission, never Asset. Product name is Open User Man / `oum`.
- The UI language is selectable (`NEXT_PUBLIC_DEFAULT_LOCALE`); the supported locales are undecided here.
- Vercel hosts the web app only; the API stays on a long-lived host.

## Brand Commitments

The name "Open User Man". Nothing else is binding.

## Evidence on Hand

No testimonials, customers, benchmarks or pricing exist. Future work must not invent them.

## Product Principles

- Show the effective access of a person, and where it comes from, before offering to change it.
- The operator owns the data and the deployment; never imply a hosted service or an account with a vendor.
- Destructive and security-relevant changes (delete, group membership, grants) are explicit and reversible where the data model allows.
- Speak the domain's words: Permission, Grant, Group, Company, Scope.

## Accessibility & Inclusion

No product-specific requirement was established. Treat as undecided rather than assuming a standard.
