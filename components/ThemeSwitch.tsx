"use client";

import { FC } from "react";
import { VisuallyHidden } from "@react-aria/visually-hidden";
import { SwitchProps, useSwitch } from "@nextui-org/switch";
import { useTheme } from "next-themes";
import { useIsSSR } from "@react-aria/ssr";
import clsx from "clsx";

export interface ThemeSwitchProps {
  className?: string;
  classNames?: SwitchProps["classNames"];
}

export const ThemeSwitch: FC<ThemeSwitchProps> = ({
  className,
  classNames,
}) => {
  const { theme, setTheme } = useTheme();
  const isSSR = useIsSSR();

  const onChange = () => {
    theme === "light" ? setTheme("dark") : setTheme("light");
  };

  const {
    Component,
    slots,
    isSelected,
    getBaseProps,
    getInputProps,
    getWrapperProps,
  } = useSwitch({
    isSelected: theme === "light",
    "aria-label": `Switch to ${theme === "light" ? "dark" : "light"} mode`,
    onChange,
  });

  return (
    <Component
      {...getBaseProps({
        className: clsx(
          "px-px transition-opacity hover:opacity-80 cursor-pointer",
          className,
          classNames?.base
        ),
      })}
    >
      <VisuallyHidden>
        <input {...getInputProps()} />
      </VisuallyHidden>
      <div
        {...getWrapperProps()}
        className={slots.wrapper({
          class: clsx(
            [
              "w-auto h-auto",
              "bg-transparent",
              "rounded-lg",
              "flex items-center justify-center",
              "group-data-[selected=true]:bg-transparent",
              "!text-default-500",
              "pt-px",
              "px-0",
              "mx-0",
            ],
            classNames?.wrapper
          ),
        })}
      >
        {!isSelected || isSSR ? (
          <svg
            aria-hidden="true"
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16ZM12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18Z" />
            <path d="M12 2C12.5523 2 13 2.44772 13 3V5C13 5.55228 12.5523 6 12 6C11.4477 6 11 5.55228 11 5V3C11 2.44772 11.4477 2 12 2Z" />
            <path d="M12 18C12.5523 18 13 18.4477 13 19V21C13 21.5523 12.5523 22 12 22C11.4477 22 11 21.5523 11 21V19C11 18.4477 11.4477 18 12 18Z" />
            <path d="M22 12C22 12.5523 21.5523 13 21 13H19C18.4477 13 18 12.5523 18 12C18 11.4477 18.4477 11 19 11H21C21.5523 11 22 11.4477 22 12Z" />
            <path d="M6 12C6 12.5523 5.55228 13 5 13H3C2.44772 13 2 12.5523 2 12C2 11.4477 2.44772 11 3 11H5C5.55228 11 6 11.4477 6 12Z" />
            <path d="M19.7782 4.22183C20.1687 4.61235 20.1687 5.24551 19.7782 5.63604L18.364 7.05025C17.9734 7.44077 17.3403 7.44077 16.9497 7.05025C16.5592 6.65972 16.5592 6.02656 16.9497 5.63604L18.364 4.22183C18.7545 3.8313 19.3877 3.8313 19.7782 4.22183Z" />
            <path d="M7.05029 16.9497C7.44082 17.3402 7.44082 17.9734 7.05029 18.3639L5.63608 19.7781C5.24556 20.1687 4.6124 20.1687 4.22187 19.7781C3.83135 19.3876 3.83135 18.7544 4.22187 18.3639L5.63608 16.9497C6.02661 16.5592 6.65977 16.5592 7.05029 16.9497Z" />
            <path d="M4.22183 4.22183C4.61235 3.8313 5.24551 3.8313 5.63604 4.22183L7.05025 5.63604C7.44077 6.02656 7.44077 6.65972 7.05025 7.05025C6.65972 7.44077 6.02656 7.44077 5.63604 7.05025L4.22183 5.63604C3.8313 5.24551 3.8313 4.61235 4.22183 4.22183Z" />
            <path d="M16.9497 16.9497C17.3402 16.5592 17.9734 16.5592 18.3639 16.9497L19.7781 18.3639C20.1687 18.7544 20.1687 19.3876 19.7781 19.7781C19.3876 20.1687 18.7544 20.1687 18.3639 19.7781L16.9497 18.3639C16.5592 17.9734 16.5592 17.3402 16.9497 16.9497Z" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              clipRule="evenodd"
              d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"
              fillRule="evenodd"
            />
          </svg>
        )}
      </div>
    </Component>
  );
};
