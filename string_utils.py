"""String utility module with common text manipulation functions."""


def capitalize_words(text: str) -> str:
    """Capitalize the first letter of each word in the input string.

    Args:
        text: The input string to process.

    Returns:
        A new string with the first letter of each word capitalized.
    """
    if not text:
        return text
    return text.title()


def reverse_string(text: str) -> str:
    """Reverse the input string.

    Args:
        text: The input string to reverse.

    Returns:
        The reversed string.
    """
    if not text:
        return text
    return text[::-1]


def count_vowels(text: str) -> int:
    """Count the number of vowels (a, e, i, o, u) in the input string.

    Args:
        text: The input string to analyze.

    Returns:
        The count of vowels in the string (case-insensitive).
    """
    if not text:
        return 0
    vowels = set('aeiouAEIOU')
    return sum(1 for char in text if char in vowels)
