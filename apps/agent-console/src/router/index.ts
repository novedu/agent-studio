import { createElement } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { StudioLayout } from '../layout/StudioLayout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: createElement(StudioLayout),
    children: [
      {
        index: true,
        element: createElement(Navigate, { to: '/agent', replace: true }),
      },
      {
        path: 'runs',
        lazy: async () => {
          const { Dashboard } = await import('../pages/Dashboard');
          return { Component: Dashboard };
        },
      },
      {
        path: 'dashboard',
        element: createElement(Navigate, { to: '/runs', replace: true }),
      },
      {
        path: 'agent',
        lazy: async () => {
          const { AgentConsole } = await import('../features/agent-console/AgentConsole');
          return { Component: AgentConsole };
        },
      },
      {
        path: 'runs/:taskId',
        lazy: async () => {
          const { RunDetail } = await import('../pages/RunDetail');
          return { Component: RunDetail };
        },
      },
      {
        path: 'workflow',
        element: createElement(Navigate, { to: '/agent', replace: true }),
      },
      {
        // Legacy session views: kept as deep links, no longer in the sidebar.
        path: 'knowledge',
        lazy: async () => {
          const { Knowledge } = await import('../pages/Knowledge');
          return { Component: Knowledge };
        },
      },
      {
        path: 'memory',
        lazy: async () => {
          const { Memory } = await import('../pages/Memory');
          return { Component: Memory };
        },
      },
      {
        path: 'evaluation',
        lazy: async () => {
          const { Evaluation } = await import('../pages/Evaluation');
          return { Component: Evaluation };
        },
      },
      {
        path: 'settings',
        lazy: async () => {
          const { Settings } = await import('../pages/Settings');
          return { Component: Settings };
        },
      },
    ],
  },
]);
