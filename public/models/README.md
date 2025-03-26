# 3D Models Directory

Place your GLTF/GLB 3D avatar models in this directory.

## Recommended Model Format

- Format: glTF 2.0 (.glb or .gltf)
- Animations: Include idle, speaking, and emotion animations
- Rigging: Skinned mesh with bones for facial expressions
- Textures: Include all necessary texture files

## Example Usage

In the AvatarModel.tsx component, you would load your model like this:

```typescript
const { nodes, materials, animations } = useGLTF('/models/your-avatar-model.glb')
```

## Note on Models

For production use, you should use properly licensed 3D models. Free options include:
- Ready Player Me avatars
- Microsoft Rocketbox avatars
- Custom models created in Blender or similar software
