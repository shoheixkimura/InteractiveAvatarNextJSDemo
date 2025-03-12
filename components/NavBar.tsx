"use client";

import {
  Link,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from "@nextui-org/react";
import { GithubIcon, HeyGenLogo } from "./Icons";
import { ThemeSwitch } from "./ThemeSwitch";

export default function NavBar() {
  return (
    <Navbar className="w-full">
      <NavbarBrand>
        <Link isExternal aria-label="HeyGen" href="https://app.heygen.com/">
          <HeyGenLogo />
        </Link>
        <div className="bg-gradient-to-br from-sky-300 to-indigo-500 bg-clip-text ml-4">
          <p className="text-xl font-semibold text-transparent">
            HeyGen Interactive Avatar SDK NextJS Demo
          </p>
        </div>
      </NavbarBrand>
      <NavbarContent justify="center">
        <NavbarItem className="flex flex-row items-center gap-4">
          <Link
            color="foreground"
            href="https://labs.heygen.com/interactive-avatar"
            isExternal
          >
            Avatars
          </Link>
          <Link
            color="foreground"
            href="https://docs.heygen.com/reference/list-voices-v2"
            isExternal
          >
            Voices
          </Link>
          <Link
            color="foreground"
            href="https://docs.heygen.com/reference/new-session-copy"
            isExternal
          >
            API Docs
          </Link>
          <Link
            color="foreground"
            href="https://help.heygen.com/en/articles/9182113-interactive-avatar-101-your-ultimate-guide"
            isExternal
          >
            Guide
          </Link>
          <Link
            aria-label="Github"
            className="flex flex-row justify-center gap-1 text-foreground"
            href="https://github.com/HeyGen-Official/StreamingAvatarSDK"
            isExternal
          >
            <GithubIcon className="text-default-500" />
            SDK
          </Link>
          <ThemeSwitch />
        </NavbarItem>
      </NavbarContent>
    </Navbar>
  );
}
