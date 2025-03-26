# Interactive Avatar Next.js Demo

This is a demonstration project showcasing interactive 3D avatars in a Next.js application using Three.js, React Three Fiber, and speech recognition.

## Features

- 3D avatar visualization with Three.js and React Three Fiber
- Real-time avatar animations and expressions
- Speech recognition for voice interaction
- Chat interface for text-based interaction
- Responsive design for desktop and mobile devices

## Technologies Used

- Next.js 14
- TypeScript
- Three.js
- React Three Fiber & Drei
- Tailwind CSS
- Zustand for state management
- Web Speech API

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/InteractiveAvatarNextJSDemo.git
   cd InteractiveAvatarNextJSDemo
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
src/
├── app/             # Next.js App Router
├── components/
│   ├── avatar/      # 3D avatar components
│   └── ui/          # UI components
├── hooks/           # Custom React hooks
├── lib/             # Utility functions
├── store/           # Zustand store
└── types/           # TypeScript type definitions
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Three.js](https://threejs.org/)
- [React Three Fiber](https://github.com/pmndrs/react-three-fiber)
- [Next.js](https://nextjs.org/)
