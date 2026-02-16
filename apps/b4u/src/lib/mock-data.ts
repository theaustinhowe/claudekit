import type {
  AuthOverride,
  ChapterMarker,
  EnvItem,
  FileTreeNode,
  FlowScript,
  MockDataEntity,
  ProjectSummary,
  RouteEntry,
  TimelineMarker,
  UserFlow,
  VoiceOption,
} from "./types";

export const PROJECT_SUMMARY: ProjectSummary = {
  name: "B4U Dashboard",
  framework: "Next.js 14 (App Router)",
  directories: ["app/", "components/", "lib/", "prisma/"],
  auth: "NextAuth (Google, credentials)",
  database: "Prisma + PostgreSQL",
};

export const FILE_TREE: FileTreeNode = {
  name: "b4u-dashboard",
  type: "directory",
  children: [
    {
      name: "app",
      type: "directory",
      children: [
        { name: "layout.tsx", type: "file" },
        { name: "page.tsx", type: "file" },
        { name: "globals.css", type: "file" },
        {
          name: "(auth)",
          type: "directory",
          children: [
            { name: "login", type: "directory", children: [{ name: "page.tsx", type: "file" }] },
            { name: "register", type: "directory", children: [{ name: "page.tsx", type: "file" }] },
          ],
        },
        {
          name: "dashboard",
          type: "directory",
          children: [
            { name: "page.tsx", type: "file" },
            { name: "layout.tsx", type: "file" },
            {
              name: "projects",
              type: "directory",
              children: [
                { name: "page.tsx", type: "file" },
                { name: "[id]", type: "directory", children: [{ name: "page.tsx", type: "file" }] },
              ],
            },
            {
              name: "analytics",
              type: "directory",
              children: [{ name: "page.tsx", type: "file" }],
            },
          ],
        },
        {
          name: "settings",
          type: "directory",
          children: [
            { name: "page.tsx", type: "file" },
            { name: "billing", type: "directory", children: [{ name: "page.tsx", type: "file" }] },
            { name: "team", type: "directory", children: [{ name: "page.tsx", type: "file" }] },
          ],
        },
        {
          name: "onboarding",
          type: "directory",
          children: [{ name: "page.tsx", type: "file" }],
        },
        {
          name: "api",
          type: "directory",
          children: [
            {
              name: "auth",
              type: "directory",
              children: [{ name: "[...nextauth]", type: "directory", children: [{ name: "route.ts", type: "file" }] }],
            },
            { name: "projects", type: "directory", children: [{ name: "route.ts", type: "file" }] },
            {
              name: "webhooks",
              type: "directory",
              children: [{ name: "stripe", type: "directory", children: [{ name: "route.ts", type: "file" }] }],
            },
          ],
        },
      ],
    },
    {
      name: "components",
      type: "directory",
      children: [
        { name: "sidebar.tsx", type: "file" },
        { name: "header.tsx", type: "file" },
        { name: "project-card.tsx", type: "file" },
        { name: "metric-display.tsx", type: "file" },
        { name: "data-table.tsx", type: "file" },
        { name: "modal.tsx", type: "file" },
        { name: "toast.tsx", type: "file" },
      ],
    },
    {
      name: "lib",
      type: "directory",
      children: [
        { name: "auth.ts", type: "file" },
        { name: "db.ts", type: "file" },
        { name: "stripe.ts", type: "file" },
        { name: "utils.ts", type: "file" },
      ],
    },
    {
      name: "prisma",
      type: "directory",
      children: [
        { name: "schema.prisma", type: "file" },
        { name: "seed.ts", type: "file" },
      ],
    },
    { name: "package.json", type: "file" },
    { name: "tsconfig.json", type: "file" },
    { name: "next.config.ts", type: "file" },
    { name: "tailwind.config.ts", type: "file" },
    { name: ".env.local", type: "file" },
  ],
};

export const ROUTES: RouteEntry[] = [
  {
    path: "/",
    title: "Landing Page",
    authRequired: false,
    description: "Marketing landing with feature highlights and CTA",
  },
  { path: "/login", title: "Login", authRequired: false, description: "Email/password and Google OAuth sign-in" },
  {
    path: "/register",
    title: "Register",
    authRequired: false,
    description: "New account creation with email verification",
  },
  { path: "/onboarding", title: "Onboarding", authRequired: true, description: "3-step setup wizard for new users" },
  {
    path: "/dashboard",
    title: "Dashboard",
    authRequired: true,
    description: "Overview with project metrics and recent activity",
  },
  {
    path: "/dashboard/projects",
    title: "Projects",
    authRequired: true,
    description: "List view of all projects with search and filters",
  },
  {
    path: "/dashboard/projects/[id]",
    title: "Project Detail",
    authRequired: true,
    description: "Kanban board with tasks, members, and timeline",
  },
  {
    path: "/dashboard/analytics",
    title: "Analytics",
    authRequired: true,
    description: "Charts for project velocity, burndown, and team output",
  },
  {
    path: "/settings",
    title: "Settings",
    authRequired: true,
    description: "Account preferences, profile, and notifications",
  },
  {
    path: "/settings/billing",
    title: "Billing",
    authRequired: true,
    description: "Subscription plan, invoices, and payment methods",
  },
  {
    path: "/settings/team",
    title: "Team",
    authRequired: true,
    description: "Invite members, manage roles and permissions",
  },
];

export const USER_FLOWS: UserFlow[] = [
  {
    id: "onboarding",
    name: "New User Onboarding",
    steps: ["/register", "/onboarding", "/dashboard"],
  },
  {
    id: "project-creation",
    name: "Project Creation",
    steps: ["/dashboard", "/dashboard/projects", "/dashboard/projects/[id]"],
  },
  {
    id: "billing-upgrade",
    name: "Billing Upgrade",
    steps: ["/dashboard", "/settings", "/settings/billing"],
  },
  {
    id: "daily-review",
    name: "Daily Dashboard Review",
    steps: ["/login", "/dashboard", "/dashboard/analytics", "/dashboard/projects/[id]"],
  },
];

export const MOCK_DATA_ENTITIES: MockDataEntity[] = [
  { name: "Users", count: 3, note: "Admin, Member, Viewer roles" },
  { name: "Projects", count: 5, note: "Various statuses: active, paused, completed" },
  { name: "Tasks", count: 24, note: "Spread across projects with assignees" },
  { name: "Invoices", count: 4, note: "Monthly billing history with paid/pending" },
  { name: "Comments", count: 18, note: "Threaded discussions on tasks" },
  { name: "Notifications", count: 8, note: "Unread and read mix" },
];

export const AUTH_OVERRIDES: AuthOverride[] = [
  { id: "bypass-login", label: "Bypass login screen", enabled: true },
  { id: "admin-role", label: "Auto-assign user role: Admin", enabled: true },
  { id: "skip-email", label: "Skip email verification", enabled: true },
  { id: "persist-session", label: "Persist session across recordings", enabled: false },
];

export const ENV_ITEMS: EnvItem[] = [
  { id: "seed-db", label: "Seed database on start", enabled: true },
  { id: "disable-rate", label: "Disable rate limiting", enabled: true },
  { id: "mock-stripe", label: "Mock Stripe webhook responses", enabled: true },
  { id: "disable-analytics", label: "Disable third-party analytics", enabled: true },
  { id: "verbose-logs", label: "Enable verbose logging", enabled: false },
];

export const FLOW_SCRIPTS: FlowScript[] = [
  {
    flowId: "onboarding",
    flowName: "New User Onboarding",
    steps: [
      {
        id: "o1",
        stepNumber: 1,
        url: "/register",
        action: "Fill in name, email, and password fields",
        expectedOutcome: "Form validates and shows green checkmarks",
        duration: "4s",
      },
      {
        id: "o2",
        stepNumber: 2,
        url: "/register",
        action: "Click 'Create Account' button",
        expectedOutcome: "Loading spinner, then redirect to onboarding",
        duration: "3s",
      },
      {
        id: "o3",
        stepNumber: 3,
        url: "/onboarding",
        action: "Select team size from dropdown",
        expectedOutcome: "Step 1 completes, advances to step 2",
        duration: "3s",
      },
      {
        id: "o4",
        stepNumber: 4,
        url: "/onboarding",
        action: "Choose 'Project Management' use case",
        expectedOutcome: "Step 2 completes with animation",
        duration: "2s",
      },
      {
        id: "o5",
        stepNumber: 5,
        url: "/onboarding",
        action: "Click 'Get Started' on final step",
        expectedOutcome: "Confetti animation, redirect to dashboard",
        duration: "4s",
      },
      {
        id: "o6",
        stepNumber: 6,
        url: "/dashboard",
        action: "View welcome card and empty state prompts",
        expectedOutcome: "Dashboard loads with onboarding checklist",
        duration: "3s",
      },
    ],
  },
  {
    flowId: "project-creation",
    flowName: "Project Creation",
    steps: [
      {
        id: "p1",
        stepNumber: 1,
        url: "/dashboard",
        action: "Click '+New Project' button in top bar",
        expectedOutcome: "Modal opens with project creation form",
        duration: "2s",
      },
      {
        id: "p2",
        stepNumber: 2,
        url: "/dashboard",
        action: "Enter project name and description",
        expectedOutcome: "Live preview updates in modal sidebar",
        duration: "4s",
      },
      {
        id: "p3",
        stepNumber: 3,
        url: "/dashboard",
        action: "Select team members from multi-select",
        expectedOutcome: "Avatars appear in assigned section",
        duration: "3s",
      },
      {
        id: "p4",
        stepNumber: 4,
        url: "/dashboard",
        action: "Set deadline using date picker",
        expectedOutcome: "Calendar popover, date chips in form",
        duration: "2s",
      },
      {
        id: "p5",
        stepNumber: 5,
        url: "/dashboard",
        action: "Click 'Create Project'",
        expectedOutcome: "Toast notification, redirect to project view",
        duration: "3s",
      },
      {
        id: "p6",
        stepNumber: 6,
        url: "/dashboard/projects/new-1",
        action: "View empty project board with columns",
        expectedOutcome: "Kanban board with To Do, In Progress, Done columns",
        duration: "3s",
      },
      {
        id: "p7",
        stepNumber: 7,
        url: "/dashboard/projects/new-1",
        action: "Add first task via inline input",
        expectedOutcome: "Task card appears in To Do column",
        duration: "3s",
      },
    ],
  },
  {
    flowId: "billing-upgrade",
    flowName: "Billing Upgrade",
    steps: [
      {
        id: "b1",
        stepNumber: 1,
        url: "/dashboard",
        action: "Click user avatar in sidebar",
        expectedOutcome: "Dropdown menu with settings link",
        duration: "2s",
      },
      {
        id: "b2",
        stepNumber: 2,
        url: "/settings",
        action: "Navigate to Billing tab",
        expectedOutcome: "Current plan details and usage meters shown",
        duration: "2s",
      },
      {
        id: "b3",
        stepNumber: 3,
        url: "/settings/billing",
        action: "Click 'Upgrade Plan' button",
        expectedOutcome: "Plan comparison cards slide in",
        duration: "3s",
      },
      {
        id: "b4",
        stepNumber: 4,
        url: "/settings/billing",
        action: "Select 'Pro' plan",
        expectedOutcome: "Plan highlights with checkmark, CTA updates",
        duration: "2s",
      },
      {
        id: "b5",
        stepNumber: 5,
        url: "/settings/billing",
        action: "Confirm payment with saved card",
        expectedOutcome: "Success animation, plan badge updates",
        duration: "4s",
      },
    ],
  },
  {
    flowId: "daily-review",
    flowName: "Daily Dashboard Review",
    steps: [
      {
        id: "d1",
        stepNumber: 1,
        url: "/login",
        action: "Enter credentials and click Sign In",
        expectedOutcome: "Loading state, redirect to dashboard",
        duration: "3s",
      },
      {
        id: "d2",
        stepNumber: 2,
        url: "/dashboard",
        action: "Review metric cards at top of dashboard",
        expectedOutcome: "Active projects, open tasks, team velocity visible",
        duration: "3s",
      },
      {
        id: "d3",
        stepNumber: 3,
        url: "/dashboard",
        action: "Click 'View Analytics' link",
        expectedOutcome: "Navigate to analytics page with charts",
        duration: "2s",
      },
      {
        id: "d4",
        stepNumber: 4,
        url: "/dashboard/analytics",
        action: "Toggle between weekly and monthly views",
        expectedOutcome: "Charts animate to new data range",
        duration: "3s",
      },
      {
        id: "d5",
        stepNumber: 5,
        url: "/dashboard/analytics",
        action: "Click on a project in the breakdown table",
        expectedOutcome: "Navigate to project detail page",
        duration: "2s",
      },
      {
        id: "d6",
        stepNumber: 6,
        url: "/dashboard/projects/proj-1",
        action: "Drag a task from In Progress to Done",
        expectedOutcome: "Card moves with animation, counter updates",
        duration: "3s",
      },
    ],
  },
];

export const VOICEOVER_SCRIPTS: Record<string, string[]> = {
  onboarding: [
    "Welcome to B4U Dashboard. Let's walk through the new user experience, starting from account creation. The registration form validates each field in real-time, giving instant feedback as you type.",
    "After creating an account, the onboarding wizard guides you through three quick steps — setting your team size, choosing your primary use case, and customizing your workspace preferences. Each step has a smooth transition with clear progress indicators.",
    "Once onboarding is complete, you land on a fresh dashboard with a welcome card and a checklist of suggested next steps. The empty states are designed to feel encouraging rather than empty, prompting the user to create their first project.",
  ],
  "project-creation": [
    "From the main dashboard, creating a new project is just one click away. The plus button in the top bar opens a focused modal that keeps you in context — no page navigation required.",
    "The project form is straightforward but powerful. As you fill in the name and description, a live preview updates in the sidebar of the modal. Team member assignment uses a searchable multi-select with avatar previews.",
    "After hitting Create, a toast notification confirms success and you're automatically routed to your new project's kanban board. The board comes pre-configured with standard columns and an inline input for adding your first task right away.",
  ],
  "billing-upgrade": [
    "Upgrading your plan starts from the settings area, accessible from the user menu in the sidebar. The billing page shows your current plan details alongside clear usage meters so you know exactly where you stand.",
    "The upgrade flow presents plan options as comparison cards that highlight what you'll gain. Selection is instant — pick a plan, confirm with your saved payment method, and you're done. The whole flow takes under ten seconds.",
  ],
  "daily-review": [
    "A typical day starts at the dashboard. After signing in, the overview shows three key metrics at a glance — active projects, open tasks, and team velocity for the current sprint.",
    "The analytics page provides deeper insight with toggleable views. Switch between weekly and monthly data to spot trends. The breakdown table below the charts lets you drill into specific projects.",
    "From analytics, jumping to a specific project takes you to its kanban board. Dragging tasks between columns updates counters in real-time, giving a satisfying sense of progress.",
  ],
};

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "alex", name: "Alex", style: "Friendly" },
  { id: "morgan", name: "Morgan", style: "Professional" },
  { id: "casey", name: "Casey", style: "Casual" },
  { id: "taylor", name: "Taylor", style: "Narrative" },
];

export const TIMELINE_MARKERS: Record<string, TimelineMarker[]> = {
  onboarding: [
    { timestamp: "0:00", label: "Registration", paragraphIndex: 0 },
    { timestamp: "0:07", label: "Onboarding Wizard", paragraphIndex: 1 },
    { timestamp: "0:16", label: "Dashboard Landing", paragraphIndex: 2 },
  ],
  "project-creation": [
    { timestamp: "0:00", label: "New Project CTA", paragraphIndex: 0 },
    { timestamp: "0:06", label: "Form & Preview", paragraphIndex: 1 },
    { timestamp: "0:15", label: "Kanban Board", paragraphIndex: 2 },
  ],
  "billing-upgrade": [
    { timestamp: "0:00", label: "Settings Navigation", paragraphIndex: 0 },
    { timestamp: "0:07", label: "Plan Selection", paragraphIndex: 1 },
  ],
  "daily-review": [
    { timestamp: "0:00", label: "Sign In & Overview", paragraphIndex: 0 },
    { timestamp: "0:06", label: "Analytics Deep Dive", paragraphIndex: 1 },
    { timestamp: "0:14", label: "Task Management", paragraphIndex: 2 },
  ],
};

export const CHAPTER_MARKERS: ChapterMarker[] = [
  { flowName: "New User Onboarding", startTime: "0:00" },
  { flowName: "Project Creation", startTime: "0:22" },
  { flowName: "Billing Upgrade", startTime: "0:44" },
  { flowName: "Daily Dashboard Review", startTime: "0:58" },
];
