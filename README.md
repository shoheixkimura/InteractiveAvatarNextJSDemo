# Interactive Avatar Next.js Demo

This is a demonstration project showcasing interactive 3D avatars in a Next.js application using Three.js, React Three Fiber, and speech recognition.

## Features

- 3D avatar visualization with Three.js and React Three Fiber
- Real-time avatar animations and expressions
- Speech recognition for voice interaction
- Chat interface for text-based interaction
- Face recognition with AWS Rekognition for personalized greetings
- Responsive design for desktop and mobile devices

## Technologies Used

- Next.js 14
- TypeScript
- Three.js
- React Three Fiber & Drei
- AWS Rekognition for face recognition
- Tailwind CSS
- NextUI for UI components
- Web Speech API
- HeyGen Streaming Avatar API

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

## Face Recognition Setup

To use the face recognition feature:

1. Create an AWS account and set up AWS Rekognition
2. Add the following environment variables to your `.env.local` file:
   ```
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_REGION=your_region (e.g., us-east-1)
   ```
3. Add reference face images to the `public/reference-faces/` directory
   - Name each file with the person's name (e.g., `JOHN.jpg`, `MARY.jpg`)
   - Use clear, front-facing portraits for best recognition results
4. Configure recognition settings in `components/useFaceRecognition.ts` if needed

The avatar will greet recognized people by name and adapt its greeting based on time of day, gender, and age.

## Acknowledgments

- [Three.js](https://threejs.org/)
- [React Three Fiber](https://github.com/pmndrs/react-three-fiber)
- [Next.js](https://nextjs.org/)
- [AWS Rekognition](https://aws.amazon.com/rekognition/)
- [HeyGen](https://www.heygen.com/)
