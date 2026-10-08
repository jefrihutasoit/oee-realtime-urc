import {
  LayoutDashboard,
  ClipboardPen,
  FileText,
  ChartLine,
  Boxes,
  Users,
  FlaskConical,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  icon: LucideIcon;
  href?: string;
  children?: NavChild[];
}

export const navigation: NavItem[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    children: [
      { label: "Machine", href: "/dashboard/machine" },
      { label: "Layout", href: "/dashboard/layout" },
    ],
  },
  { label: "Reject Input", icon: ClipboardPen, href: "/reject-input" },
  { label: "Reports", icon: FileText, href: "/reports" },
  { label: "Historical", icon: ChartLine, href: "/historical" },
  { label: "SKU Management", icon: Boxes, href: "/sku" },
  { label: "User Management", icon: Users, href: "/users" },
  { label: "Simulator", icon: FlaskConical, href: "/simulator" },
  {
    label: "Settings",
    icon: Settings,
    children: [
      { label: "Machine Management", href: "/settings/machines" },
      { label: "Shift Management", href: "/settings/shifts" },
      { label: "Layout Mapping", href: "/settings/layout" },
      { label: "Status Definition", href: "/settings/status-definition" },
    ],
  },
];
